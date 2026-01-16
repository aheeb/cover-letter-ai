import { Client } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

async function getOrCreateDatabase(): Promise<string> {
  // If database ID is set, try to retrieve it to verify it exists
  if (process.env.NOTION_DATABASE_ID) {
    try {
      await notion.databases.retrieve({
        database_id: process.env.NOTION_DATABASE_ID,
      });
      return process.env.NOTION_DATABASE_ID;
    } catch (error: any) {
      // If database doesn't exist (404), we'll create a new one
      // For other errors (403, etc.), rethrow
      if (error.status === 404) {
        // Database doesn't exist, will create below
      } else {
        throw error;
      }
    }
  }

  // Create a new database
  // Try workspace-level first (for public integrations), fallback to parent page (for internal integrations)
  const parent = process.env.NOTION_PARENT_PAGE_ID
    ? {
        type: "page_id" as const,
        page_id: process.env.NOTION_PARENT_PAGE_ID,
      }
    : {
        type: "workspace" as const,
        workspace: true,
      };

  try {
    // Use the older API format that the SDK supports (properties at top level)
    // The SDK v2.2.15 doesn't fully support initial_data_source yet
    const database = await notion.databases.create({
      parent,
      title: [
        {
          type: "text",
          text: {
            content: "Cover Letters",
          },
        },
      ],
      properties: {
        Company: {
          title: {},
        },
        "Job URL": {
          url: {},
        },
        "Cover Letter PDF": {
          files: {},
        },
        "Cover Letter DOCX": {
          url: {},
        },
      },
    } as any);

    return database.id;
  } catch (error: any) {
    // If workspace-level creation failed (e.g., for internal integrations), provide helpful error
    if (!process.env.NOTION_PARENT_PAGE_ID && error.status === 400) {
      throw new Error(
        "Failed to create database at workspace level. " +
          "This usually means you're using an internal integration. " +
          "Please set NOTION_PARENT_PAGE_ID in your environment variables to specify a parent page for the database, " +
          "or set NOTION_DATABASE_ID to use an existing database."
      );
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdf = formData.get("pdf") as File;
    const docx = formData.get("docx") as File;
    const company = formData.get("company") as string;
    const jobUrl = formData.get("job_url") as string;
    const pdfFilename = formData.get("pdf_filename") as string;
    const docxFilename = formData.get("docx_filename") as string;

    if (!pdf || !docx || !company) {
      return NextResponse.json(
        {
          error: "Missing required fields: pdf, docx, and company are required",
        },
        { status: 400 }
      );
    }

    if (!process.env.NOTION_TOKEN) {
      return NextResponse.json(
        { error: "NOTION_TOKEN is not configured" },
        { status: 500 }
      );
    }

    // Upload PDF to UploadThing
    const uploadResult = await utapi.uploadFiles([pdf], {
      acl: "public-read",
    });

    // uploadFiles returns an array when given an array
    const result = Array.isArray(uploadResult)
      ? uploadResult.length > 0
        ? uploadResult[0]
        : null
      : uploadResult;

    if (!result || !result.data || result.error) {
      return NextResponse.json(
        { error: result?.error?.message || "Failed to upload PDF" },
        { status: 500 }
      );
    }

    const pdfUrl = result.data.url;

    // Upload DOCX to UploadThing
    const docxUploadResult = await utapi.uploadFiles([docx], {
      acl: "public-read",
    });

    const docxResult = Array.isArray(docxUploadResult)
      ? docxUploadResult.length > 0
        ? docxUploadResult[0]
        : null
      : docxUploadResult;

    if (!docxResult || !docxResult.data || docxResult.error) {
      return NextResponse.json(
        { error: docxResult?.error?.message || "Failed to upload DOCX" },
        { status: 500 }
      );
    }

    const docxUrl = docxResult.data.url;

    // Get or create the database
    const databaseId = await getOrCreateDatabase();

    // Create Notion database page
    const page = await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties: {
        Company: {
          title: [
            {
              text: {
                content: company,
              },
            },
          ],
        },
        "Job URL": {
          url: jobUrl || null,
        },
        "Cover Letter PDF": {
          files: [
            {
              type: "external",
              name: pdfFilename,
              external: {
                url: pdfUrl,
              },
            },
          ],
        },
        "Cover Letter DOCX": {
          url: docxUrl,
        },
      },
    });

    // Extract URL from page object (may be in different properties depending on SDK version)
    const pageUrl =
      "url" in page && typeof page.url === "string"
        ? page.url
        : `https://notion.so/${page.id.replace(/-/g, "")}`;

    return NextResponse.json({
      notion_page_url: pageUrl,
      pdf_url: pdfUrl,
      docx_url: docxUrl,
      database_id: databaseId,
      database_created: !process.env.NOTION_DATABASE_ID,
    });
  } catch (error) {
    console.error("Notion save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

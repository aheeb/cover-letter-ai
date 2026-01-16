"use client";

import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HttpError, fetchOk } from "@/lib/http";

type Language = "de" | "en";
type Tone = "professional" | "friendly" | "concise";
type Length = "short" | "medium" | "long";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      letter: unknown;
      dateLine: string;
      companyName: string;
      pdfBlobUrl: string;
      pdfFilename: string;
      docxFilename: string;
    };

type NotionSaveState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; notionPageUrl: string };

function JobSection(props: {
  jobUrl: string;
  setJobUrl: (value: string) => void;
  jobText: string;
  setJobText: (value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"url" | "text">("url");

  useEffect(() => {
    if (props.jobText && !props.jobUrl) setActiveTab("text");
    else if (props.jobUrl && !props.jobText) setActiveTab("url");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Job Source</Label>
        <TabsList>
          <TabsTrigger
            onClick={() => setActiveTab("url")}
            active={activeTab === "url"}
          >
            <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
            URL
          </TabsTrigger>
          <TabsTrigger
            onClick={() => setActiveTab("text")}
            active={activeTab === "text"}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Paste Text
          </TabsTrigger>
        </TabsList>
      </div>

      <div className={activeTab === "url" ? "block" : "hidden"}>
        <Input
          placeholder="https://jobs.example.ch/position/..."
          value={props.jobUrl}
          onChange={(e) => props.setJobUrl(e.target.value)}
          autoFocus={activeTab === "url"}
          className="font-mono text-sm"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Paste the URL of the job posting. We&apos;ll extract the details
          automatically.
        </p>
      </div>

      <div className={activeTab === "text" ? "block" : "hidden"}>
        <Textarea
          placeholder="Paste the full job description here..."
          className="min-h-[140px] resize-none text-sm"
          value={props.jobText}
          onChange={(e) => props.setJobText(e.target.value)}
          autoFocus={activeTab === "text"}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Use this if the job posting is behind a login or from an internal
          document.
        </p>
      </div>
    </div>
  );
}

function OptionsSection(props: {
  language: Language;
  setLanguage: (value: Language) => void;
  tone: Tone;
  setTone: (value: Tone) => void;
  length: Length;
  setLength: (value: Length) => void;
  targetRole: string;
  setTargetRole: (value: string) => void;
  onAutofillRole: () => void;
  isAutofilling: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Language</Label>
          <Select
            value={props.language}
            onChange={(e) => props.setLanguage(e.target.value as Language)}
            className="w-full"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tone</Label>
          <Select
            value={props.tone}
            onChange={(e) => props.setTone(e.target.value as Tone)}
            className="w-full"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Length</Label>
          <Select
            value={props.length}
            onChange={(e) => props.setLength(e.target.value as Length)}
            className="w-full"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Target Role <span className="opacity-60">(optional)</span>
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={props.onAutofillRole}
            disabled={props.isAutofilling}
          >
            {props.isAutofilling ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Detecting...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Auto-detect
              </span>
            )}
          </Button>
        </div>
        <Input
          placeholder="e.g. Senior Software Engineer"
          value={props.targetRole}
          onChange={(e) => props.setTargetRole(e.target.value)}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    try {
      const data: unknown = JSON.parse(err.bodyText);
      if (
        typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as { detail?: unknown }).detail === "string"
      ) {
        return (data as { detail: string }).detail;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error?: unknown }).error === "string"
      ) {
        return (data as { error: string }).error;
      }
    } catch {
      // ignore
    }
    return err.bodyText
      ? `HTTP ${err.status}: ${err.bodyText}`
      : `HTTP ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return "An unknown error occurred.";
}

export function GeneratorForm() {
  const pdfBlobUrlRef = useRef<string | null>(null);

  const [jobUrl, setJobUrl] = useState<string>("");
  const [jobText, setJobText] = useState<string>("");

  const [language, setLanguage] = useState<Language>("de");
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("medium");
  const [targetRole, setTargetRole] = useState<string>("");

  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "idle",
  });
  const [autofillState, setAutofillState] = useState<{
    status: "idle" | "loading" | "error";
    message?: string;
  }>({ status: "idle" });
  const [notionSaveState, setNotionSaveState] = useState<NotionSaveState>({
    status: "idle",
  });

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current);
    };
  }, []);

  async function onGeneratePreview() {
    if (jobUrl.trim().length === 0 && jobText.trim().length === 0) {
      setPreviewState({
        status: "error",
        message: "Please provide either a Job URL or Job Text.",
      });
      return;
    }

    if (previewState.status === "done" && pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }

    setPreviewState({ status: "loading" });

    const form = new FormData();
    if (jobUrl.trim().length > 0) form.append("job_url", jobUrl.trim());
    if (jobText.trim().length > 0) form.append("job_text", jobText.trim());
    form.append("language", language);
    form.append("tone", tone);
    form.append("length", length);
    if (targetRole.trim().length > 0)
      form.append("target_role", targetRole.trim());

    try {
      const letterRes = await fetchOk("/api/letter", {
        method: "POST",
        body: form,
      });
      const letterData = await letterRes.json();

      const pdfRes = await fetchOk("/api/render/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: letterData.letter,
          date_line: letterData.date_line,
        }),
      });

      const pdfBlob = await pdfRes.blob();
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);
      pdfBlobUrlRef.current = pdfBlobUrl;

      setPreviewState({
        status: "done",
        letter: letterData.letter,
        dateLine: letterData.date_line,
        companyName: letterData.company_name,
        pdfBlobUrl,
        pdfFilename: letterData.pdf_filename,
        docxFilename: letterData.docx_filename,
      });
    } catch (err) {
      setPreviewState({ status: "error", message: getErrorMessage(err) });
    }
  }

  async function onDownloadDocx() {
    if (previewState.status !== "done") return;

    try {
      const res = await fetchOk("/api/render/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: previewState.letter,
          date_line: previewState.dateLine,
        }),
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = previewState.docxFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download DOCX:", err);
    }
  }

  async function onSaveToNotion() {
    if (previewState.status !== "done") return;

    setNotionSaveState({ status: "loading" });

    try {
      const pdfBlob = await fetch(previewState.pdfBlobUrl).then((r) =>
        r.blob()
      );
      const pdfFile = new File([pdfBlob], previewState.pdfFilename, {
        type: "application/pdf",
      });

      const docxRes = await fetchOk("/api/render/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: previewState.letter,
          date_line: previewState.dateLine,
        }),
      });
      const docxBlob = await docxRes.blob();
      const docxFile = new File([docxBlob], previewState.docxFilename, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const form = new FormData();
      form.append("pdf", pdfFile);
      form.append("docx", docxFile);
      form.append("company", previewState.companyName);
      form.append("job_url", jobUrl.trim() || "");
      form.append("pdf_filename", previewState.pdfFilename);
      form.append("docx_filename", previewState.docxFilename);

      const res = await fetchOk(
        new URL("/api/notion/save", window.location.origin),
        {
          method: "POST",
          body: form,
        }
      );

      const data = await res.json();
      setNotionSaveState({
        status: "done",
        notionPageUrl: data.notion_page_url,
      });
    } catch (err) {
      setNotionSaveState({
        status: "error",
        message: getErrorMessage(err),
      });
    }
  }

  async function autofillRoleFromUrl() {
    const url = jobUrl.trim();
    if (!url) {
      setAutofillState({
        status: "error",
        message: "Please enter a Job URL first.",
      });
      return;
    }
    if (jobText.trim().length > 0) {
      setAutofillState({
        status: "error",
        message: "Job text is set – role will be derived from it.",
      });
      return;
    }

    setAutofillState({ status: "loading" });
    try {
      const form = new FormData();
      form.append("job_url", url);
      const res = await fetchOk("/api/job/preview", {
        method: "POST",
        body: form,
      });
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "role" in data &&
        typeof (data as { role?: unknown }).role === "string"
      ) {
        const role = (data as { role: string }).role.trim();
        if (role.length > 0) {
          setTargetRole(role);
          setAutofillState({ status: "idle" });
          return;
        }
      }
      setAutofillState({
        status: "error",
        message: "Could not detect role from URL.",
      });
    } catch (err) {
      setAutofillState({ status: "error", message: getErrorMessage(err) });
    }
  }

  const isGenerating = previewState.status === "loading";

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Left Column: Inputs */}
      <div className="space-y-6">
        {/* Step 1: Job Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                1
              </div>
              <div>
                <CardTitle className="text-lg">Job Details</CardTitle>
                <CardDescription>
                  Provide the job posting to tailor the letter.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <JobSection
              jobUrl={jobUrl}
              setJobUrl={setJobUrl}
              jobText={jobText}
              setJobText={setJobText}
            />
          </CardContent>
        </Card>

        {/* Step 2: Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                2
              </div>
              <div>
                <CardTitle className="text-lg">Configuration</CardTitle>
                <CardDescription>
                  Customize the output to match your style.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <OptionsSection
              language={language}
              setLanguage={setLanguage}
              tone={tone}
              setTone={setTone}
              length={length}
              setLength={setLength}
              targetRole={targetRole}
              setTargetRole={setTargetRole}
              onAutofillRole={autofillRoleFromUrl}
              isAutofilling={autofillState.status === "loading"}
            />

            {autofillState.status === "error" && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{autofillState.message}</p>
              </div>
            )}

            <Separator />

            <Button
              className="w-full"
              size="lg"
              onClick={onGeneratePreview}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Cover Letter
                </>
              )}
            </Button>

            {previewState.status === "idle" && (
              <p className="text-center text-xs text-muted-foreground">
                Make sure you&apos;ve{" "}
                <a
                  href="/settings"
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  uploaded your CV
                </a>{" "}
                first
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Preview & Output */}
      <div className="space-y-6 lg:sticky lg:top-6">
        {/* Error Messages */}
        {previewState.status === "error" && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{previewState.message}</p>
          </div>
        )}

        {/* Notion Success */}
        {notionSaveState.status === "done" && (
          <div className="flex items-center justify-between rounded-lg border border-green-500/50 bg-green-500/10 p-4">
            <div className="flex items-center gap-3 text-sm text-green-700">
              <Check className="h-4 w-4 shrink-0" />
              <p>Saved to Notion successfully!</p>
            </div>
            <a
              href={notionSaveState.notionPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:underline"
            >
              Open in Notion
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Error for Notion */}
        {notionSaveState.status === "error" && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{notionSaveState.message}</p>
          </div>
        )}

        {/* Preview Card */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/40 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">Preview</CardTitle>
                {previewState.status === "done" && (
                  <Badge variant="secondary" className="font-normal">
                    {previewState.companyName}
                  </Badge>
                )}
              </div>
              {previewState.status === "done" && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onDownloadDocx}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    DOCX
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSaveToNotion}
                    disabled={notionSaveState.status === "loading"}
                    className="bg-[#000] hover:bg-[#191919]"
                  >
                    {notionSaveState.status === "loading" ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Notion
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          {previewState.status === "idle" && (
            <CardContent className="flex min-h-[500px] flex-col items-center justify-center bg-muted/20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted shadow-sm">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">
                Ready to generate
              </h3>
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Fill in the job details on the left and click generate to create
                your cover letter.
              </p>
            </CardContent>
          )}

          {previewState.status === "loading" && (
            <CardContent className="flex min-h-[500px] flex-col items-center justify-center bg-muted/20">
              <div className="relative mb-4">
                <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
              <h3 className="mb-1 font-medium">
                Generating your cover letter...
              </h3>
              <p className="text-sm text-muted-foreground">
                This may take a few seconds
              </p>
            </CardContent>
          )}

          {previewState.status === "done" && (
            <div className="overflow-hidden bg-white">
              <iframe
                src={`${previewState.pdfBlobUrl}#navpanes=0&view=FitH`}
                className="h-[700px] w-full"
                title="Cover letter preview"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

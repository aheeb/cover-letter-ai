"use client";

import {
  AlertCircle,
  Download,
  FileText,
  Link as LinkIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseFilenameFromContentDisposition } from "@/lib/contentDisposition";
import { getApiBaseUrl } from "@/lib/env";
import { HttpError, fetchOk } from "@/lib/http";

type Language = "de" | "en";
type Tone = "professional" | "friendly" | "concise";
type Length = "short" | "medium" | "long";

type GenerateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; downloadUrl: string; filename: string };

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

function JobSection(props: {
  jobUrl: string;
  setJobUrl: (value: string) => void;
  jobText: string;
  setJobText: (value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"url" | "text">("url");

  // Auto-switch tab if one input has content
  useEffect(() => {
    if (props.jobText && !props.jobUrl) setActiveTab("text");
    else if (props.jobUrl && !props.jobText) setActiveTab("url");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base">Job Description</Label>
        <TabsList>
          <TabsTrigger
            onClick={() => setActiveTab("url")}
            active={activeTab === "url"}
          >
            <LinkIcon className="mr-2 h-3.5 w-3.5" />
            Link
          </TabsTrigger>
          <TabsTrigger
            onClick={() => setActiveTab("text")}
            active={activeTab === "text"}
          >
            <FileText className="mr-2 h-3.5 w-3.5" />
            Text
          </TabsTrigger>
        </TabsList>
      </div>

      <div className={activeTab === "url" ? "block" : "hidden"}>
        <Input
          placeholder="https://company.com/jobs/..."
          value={props.jobUrl}
          onChange={(e) => props.setJobUrl(e.target.value)}
          autoFocus={activeTab === "url"}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Paste the URL of the job posting. We'll extract the details
          automatically.
        </p>
      </div>

      <div className={activeTab === "text" ? "block" : "hidden"}>
        <Textarea
          placeholder="Paste the job description here..."
          className="min-h-[120px]"
          value={props.jobText}
          onChange={(e) => props.setJobText(e.target.value)}
          autoFocus={activeTab === "text"}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Fallback if scraping doesn't work or for internal documents.
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
      <Label className="text-base">Options</Label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs text-zinc-500">Language</Label>
          <Select
            value={props.language}
            onChange={(e) => props.setLanguage(e.target.value as Language)}
            className="w-full min-w-[120px]"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-500">Tone</Label>
          <Select
            value={props.tone}
            onChange={(e) => props.setTone(e.target.value as Tone)}
            className="w-full min-w-[120px]"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-500">Length</Label>
          <Select
            value={props.length}
            onChange={(e) => props.setLength(e.target.value as Length)}
            className="w-full min-w-[120px]"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-zinc-500">
            Target Role (Optional)
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900"
            onClick={props.onAutofillRole}
            disabled={props.isAutofilling}
          >
            {props.isAutofilling ? (
              <span className="animate-pulse">Detecting...</span>
            ) : (
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                <span>Auto-detect from URL</span>
              </div>
            )}
          </Button>
        </div>
        <Input
          placeholder="e.g. Senior Software Engineer"
          value={props.targetRole}
          onChange={(e) => props.setTargetRole(e.target.value)}
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
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const downloadUrlRef = useRef<string | null>(null);

  const [jobUrl, setJobUrl] = useState<string>("");
  const [jobText, setJobText] = useState<string>("");
  const [cvFile, setCvFile] = useState<File | null>(null);

  const [language, setLanguage] = useState<Language>("de");
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("medium");
  const [targetRole, setTargetRole] = useState<string>("");

  const [state, setState] = useState<GenerateState>({ status: "idle" });
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "idle",
  });

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    };
  }, []);

  async function onGenerate() {
    if (jobUrl.trim().length === 0 && jobText.trim().length === 0) {
      setState({
        status: "error",
        message: "Please provide either a Job URL or Job Text.",
      });
      return;
    }

    if (state.status === "done") {
      URL.revokeObjectURL(state.downloadUrl);
    }
    setState({ status: "loading" });

    const form = new FormData();
    if (cvFile) form.append("cv_pdf", cvFile);
    if (jobUrl.trim().length > 0) form.append("job_url", jobUrl.trim());
    if (jobText.trim().length > 0) form.append("job_text", jobText.trim());
    form.append("language", language);
    form.append("tone", tone);
    form.append("length", length);
    if (targetRole.trim().length > 0)
      form.append("target_role", targetRole.trim());

    try {
      const res = await fetchOk(new URL("/v1/generate", apiBaseUrl), {
        method: "POST",
        body: form,
      });

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      downloadUrlRef.current = downloadUrl;
      const filename =
        parseFilenameFromContentDisposition(
          res.headers.get("Content-Disposition")
        ) ?? "Cover_Letter.docx";

      setState({ status: "done", downloadUrl, filename });
    } catch (err) {
      setState({ status: "error", message: getErrorMessage(err) });
    }
  }

  async function autofillRoleFromUrl() {
    const url = jobUrl.trim();
    if (!url) {
      setPreviewState({
        status: "error",
        message: "Please enter a Job URL first.",
      });
      return;
    }
    if (jobText.trim().length > 0) {
      setPreviewState({
        status: "error",
        message: "Job text is set – role will be derived from it.",
      });
      return;
    }

    setPreviewState({ status: "loading" });
    try {
      const form = new FormData();
      form.append("job_url", url);
      const res = await fetchOk(new URL("/v1/job/preview", apiBaseUrl), {
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
          setPreviewState({ status: "idle" });
          return;
        }
      }
      setPreviewState({
        status: "error",
        message: "Could not detect role from URL.",
      });
    } catch (err) {
      setPreviewState({ status: "error", message: getErrorMessage(err) });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {state.status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {state.message}
          </div>
        )}

        {previewState.status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {previewState.message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>
              Provide the job posting to tailor the letter.
            </CardDescription>
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

        <Card>
          <CardHeader>
            <CardTitle>Your CV</CardTitle>
            <CardDescription>
              Upload your CV (PDF) to extract your experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              file={cvFile}
              onFileSelect={setCvFile}
              accept="application/pdf"
              label="Upload CV (PDF)"
              description="Drag & drop or click to browse"
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
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
              isAutofilling={previewState.status === "loading"}
            />

            <div className="mt-8 pt-6 border-t border-zinc-100">
              <Button
                className="w-full h-12 text-base shadow-lg hover:shadow-xl transition-all"
                onClick={onGenerate}
                disabled={state.status === "loading"}
              >
                {state.status === "loading" ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Letter
                  </>
                )}
              </Button>

              {state.status === "done" && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                  <a
                    href={state.downloadUrl}
                    download={state.filename}
                    className="flex items-center justify-center gap-2 w-full rounded-md border border-zinc-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download {state.filename}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

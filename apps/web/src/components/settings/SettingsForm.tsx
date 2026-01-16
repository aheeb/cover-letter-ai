"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { AlertCircle, CheckCircle2, Upload, User } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpError, fetchOk } from "@/lib/http";
import type { SenderProfile } from "@/lib/sender";

type ProfileResponse = {
  sender: SenderProfile;
  cv: {
    fileKey: string | null;
    fileName: string | null;
  };
};

type SettingsFormProps = {
  initialData: ProfileResponse;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    return err.bodyText ? `HTTP ${err.status}: ${err.bodyText}` : `HTTP ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return "An unknown error occurred.";
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const profileFetcher = async (url: string): Promise<ProfileResponse> => {
  const res = await fetchOk(url);
  return (await res.json()) as ProfileResponse;
};

export function SettingsForm({ initialData }: SettingsFormProps) {
  const { data, error, isLoading, mutate } = useSWR<ProfileResponse>(
    "/api/profile/address",
    profileFetcher,
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
    }
  );

  const [sender, setSender] = useState<SenderProfile>(initialData.sender);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvFilename, setCvFilename] = useState<string | null>(
    initialData.cv.fileName
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const effectiveData = data ?? initialData;

  useEffect(() => {
    if (!isDirty && effectiveData) {
      setSender(effectiveData.sender);
      setCvFilename(effectiveData.cv.fileName);
    }
  }, [effectiveData, isDirty]);

  useEffect(() => {
    if (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [error]);

  const updateSender = (updates: Partial<SenderProfile>) => {
    setIsDirty(true);
    setSender((prev) => ({ ...prev, ...updates }));
  };

  async function onSaveProfile() {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetchOk("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sender),
      });
      const payload = (await res.json()) as { sender: SenderProfile };
      const nextData: ProfileResponse = {
        sender: payload.sender,
        cv: {
          fileKey: effectiveData?.cv.fileKey ?? null,
          fileName: effectiveData?.cv.fileName ?? null,
        },
      };
      await mutate(nextData, false);
      setSender(payload.sender);
      setIsDirty(false);
      setSuccessMessage("Profile saved successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onUploadCv() {
    if (!cvFile) return;
    setUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const form = new FormData();
      form.append("cv_pdf", cvFile);
      const res = await fetchOk("/api/profile/cv", {
        method: "POST",
        body: form,
      });
      const payload = (await res.json()) as { fileName: string };
      const nextData: ProfileResponse = {
        sender: effectiveData?.sender ?? sender,
        cv: {
          fileKey: effectiveData?.cv.fileKey ?? null,
          fileName: payload.fileName,
        },
      };
      await mutate(nextData, false);
      setCvFilename(payload.fileName);
      setCvFile(null);
      setSuccessMessage("CV uploaded successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  if (isLoading && !data) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your profile and CV for generating cover letters.
        </p>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Sender Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Sender Details</CardTitle>
              <CardDescription>
                Your address appears at the top of the letter. The location is
                used for the date line.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={sender.name}
                onChange={(e) => updateSender({ name: e.target.value })}
                placeholder="Max Muster"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="street">Street Address</Label>
              <Input
                id="street"
                value={sender.street}
                onChange={(e) => updateSender({ street: e.target.value })}
                placeholder="Musterstrasse 12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={sender.postalCode}
                onChange={(e) => updateSender({ postalCode: e.target.value })}
                placeholder="8000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={sender.city}
                onChange={(e) => updateSender({ city: e.target.value })}
                placeholder="Zürich"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">
                Country <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="country"
                value={sender.country}
                onChange={(e) => updateSender({ country: e.target.value })}
                placeholder="Switzerland"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location for Date Line</Label>
              <Input
                id="location"
                value={sender.location}
                onChange={(e) => updateSender({ location: e.target.value })}
                placeholder="Zürich"
              />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={onSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save Details"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CV Upload Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">CV Upload</CardTitle>
              <CardDescription>
                Upload your CV as a PDF. It will be used to generate personalized
                cover letters.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cvFilename && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                Current CV: <span className="font-medium">{cvFilename}</span>
              </span>
            </div>
          )}
          <FileUpload
            file={cvFile}
            onFileSelect={setCvFile}
            accept="application/pdf"
            label="Upload CV (PDF)"
            description="Drag & drop or click to browse"
          />
          <div className="flex justify-end">
            <Button onClick={onUploadCv} disabled={!cvFile || uploading}>
              {uploading ? "Uploading..." : "Upload CV"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

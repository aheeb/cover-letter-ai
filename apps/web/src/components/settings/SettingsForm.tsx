"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { AlertCircle, CheckCircle2, Upload, User } from "lucide-react";
import { useTranslations } from "next-intl";

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

function getErrorMessage(
  err: unknown,
  tSettings: (key: string) => string
): string {
  if (err instanceof HttpError) {
    return err.bodyText ? `HTTP ${err.status}: ${err.bodyText}` : `HTTP ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return tSettings("error.unknown");
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
  const tSettings = useTranslations("settings");
  const tActions = useTranslations("actions");

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
      setErrorMessage(getErrorMessage(error, tSettings));
    }
  }, [error, tSettings]);

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
      setSuccessMessage(tSettings("success.profileSaved"));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, tSettings));
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
      setSuccessMessage(tSettings("success.cvUploaded"));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, tSettings));
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
        <h1 className="text-2xl font-semibold tracking-tight">
          {tSettings("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {tSettings("description")}
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
            <CardTitle className="text-lg">
              {tSettings("senderDetailsTitle")}
            </CardTitle>
              <CardDescription>
              {tSettings("senderDetailsDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{tSettings("field.fullName")}</Label>
              <Input
                id="name"
                value={sender.name}
                onChange={(e) => updateSender({ name: e.target.value })}
                placeholder={tSettings("placeholder.name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="street">{tSettings("field.streetAddress")}</Label>
              <Input
                id="street"
                value={sender.street}
                onChange={(e) => updateSender({ street: e.target.value })}
                placeholder={tSettings("placeholder.street")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">
                {tSettings("field.postalCode")}
              </Label>
              <Input
                id="postalCode"
                value={sender.postalCode}
                onChange={(e) => updateSender({ postalCode: e.target.value })}
                placeholder={tSettings("placeholder.postalCode")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">{tSettings("field.city")}</Label>
              <Input
                id="city"
                value={sender.city}
                onChange={(e) => updateSender({ city: e.target.value })}
                placeholder={tSettings("placeholder.city")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">
                {tSettings("field.country")}{" "}
                <span className="text-muted-foreground">
                  {tSettings("field.countryOptional")}
                </span>
              </Label>
              <Input
                id="country"
                value={sender.country}
                onChange={(e) => updateSender({ country: e.target.value })}
                placeholder={tSettings("placeholder.country")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">
                {tSettings("field.locationDateLine")}
              </Label>
              <Input
                id="location"
                value={sender.location}
                onChange={(e) => updateSender({ location: e.target.value })}
                placeholder={tSettings("placeholder.location")}
              />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={onSaveProfile} disabled={saving}>
              {saving ? tActions("saving") : tActions("saveDetails")}
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
              <CardTitle className="text-lg">
                {tSettings("cvUploadTitle")}
              </CardTitle>
              <CardDescription>
                {tSettings("cvUploadDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cvFilename && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                {tSettings("currentCv")}{" "}
                <span className="font-medium">{cvFilename}</span>
              </span>
            </div>
          )}
          <FileUpload
            file={cvFile}
            onFileSelect={setCvFile}
            accept="application/pdf"
            label={tActions("uploadCvPdf")}
            description={tActions("browseHint")}
          />
          <div className="flex justify-end">
            <Button onClick={onUploadCv} disabled={!cvFile || uploading}>
              {uploading ? tActions("uploading") : tActions("uploadCv")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

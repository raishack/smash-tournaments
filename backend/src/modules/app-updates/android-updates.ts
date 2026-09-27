import fs from "fs/promises";
import path from "path";
import type express from "express";

export interface AndroidAppUpdateEntry {
  applicationId: string;
  versionCode: number;
  versionName: string;
  apkUrl?: string;
  apkFile?: string;
  required?: boolean;
  minSupportedVersionCode?: number;
  title?: string;
  notes?: string;
  changelog?: string[];
  publishedAt?: string;
  sha256?: string;
  sizeBytes?: number;
}

interface AndroidAppUpdatesManifest {
  apps?: AndroidAppUpdateEntry[];
}

export interface AndroidAppUpdateResponse {
  applicationId: string;
  versionCode: number;
  versionName: string;
  apkUrl: string;
  required: boolean;
  minSupportedVersionCode?: number;
  title?: string;
  notes?: string;
  changelog?: string[];
  publishedAt?: string;
  sha256?: string;
  sizeBytes?: number;
}

export class AndroidAppUpdatesStore {
  constructor(
    private readonly updatesDir: string,
    private readonly publicBaseUrl?: string,
  ) {}

  get filesDir(): string {
    return path.join(this.updatesDir, "files");
  }

  private get manifestPath(): string {
    return path.join(this.updatesDir, "manifest.json");
  }

  async getUpdate(
    applicationId: string,
    request?: express.Request,
  ): Promise<AndroidAppUpdateResponse | null> {
    const manifest = await this.readManifest();
    const entry = manifest.apps?.find((item) => item.applicationId === applicationId);
    if (!entry) {
      return null;
    }

    const apkUrl = this.resolveApkUrl(entry, request);
    if (!apkUrl) {
      return null;
    }

    return {
      applicationId: entry.applicationId,
      versionCode: entry.versionCode,
      versionName: entry.versionName,
      apkUrl,
      required: entry.required === true,
      minSupportedVersionCode: entry.minSupportedVersionCode,
      title: entry.title,
      notes: entry.notes,
      changelog: entry.changelog,
      publishedAt: entry.publishedAt,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
    };
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.updatesDir, { recursive: true });
    await fs.mkdir(this.filesDir, { recursive: true });
  }

  private async readManifest(): Promise<AndroidAppUpdatesManifest> {
    try {
      const content = await fs.readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(content) as AndroidAppUpdatesManifest;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { apps: [] };
      }
      throw error;
    }
  }

  private resolveApkUrl(
    entry: AndroidAppUpdateEntry,
    request?: express.Request,
  ): string | null {
    if (entry.apkUrl?.trim()) {
      return entry.apkUrl.trim();
    }
    if (!entry.apkFile?.trim()) {
      return null;
    }

    const baseUrl = this.resolveBaseUrl(request);
    return `${baseUrl}/downloads/android/${encodeURIComponent(entry.apkFile.trim())}`;
  }

  private resolveBaseUrl(request?: express.Request): string {
    const configured = this.publicBaseUrl?.trim();
    if (configured) {
      return configured.replace(/\/+$/, "");
    }
    if (request) {
      const protocol = request.header("x-forwarded-proto")?.split(",")[0]?.trim() || request.protocol;
      const host = request.header("x-forwarded-host")?.split(",")[0]?.trim() || request.get("host");
      return `${protocol}://${host}`;
    }
    return "";
  }
}

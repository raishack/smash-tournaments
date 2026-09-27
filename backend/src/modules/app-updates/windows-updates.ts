import fs from "fs/promises";
import path from "path";
import type express from "express";

export interface WindowsAppUpdateEntry {
  applicationId: string;
  version: string;
  msiUrl?: string;
  msiFile?: string;
  required?: boolean;
  minSupportedVersion?: string;
  title?: string;
  notes?: string;
  changelog?: string[];
  publishedAt?: string;
  sha256?: string;
  sizeBytes?: number;
}

interface WindowsAppUpdatesManifest {
  apps?: WindowsAppUpdateEntry[];
}

export interface WindowsAppUpdateResponse {
  applicationId: string;
  version: string;
  msiUrl: string;
  required: boolean;
  minSupportedVersion?: string;
  title?: string;
  notes?: string;
  changelog?: string[];
  publishedAt?: string;
  sha256?: string;
  sizeBytes?: number;
}

export class WindowsAppUpdatesStore {
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
  ): Promise<WindowsAppUpdateResponse | null> {
    const manifest = await this.readManifest();
    const entry = manifest.apps?.find((item) => item.applicationId === applicationId);
    if (!entry) {
      return null;
    }

    const msiUrl = this.resolveMsiUrl(entry, request);
    if (!msiUrl) {
      return null;
    }

    return {
      applicationId: entry.applicationId,
      version: entry.version,
      msiUrl,
      required: entry.required === true,
      minSupportedVersion: entry.minSupportedVersion,
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

  private async readManifest(): Promise<WindowsAppUpdatesManifest> {
    try {
      const content = await fs.readFile(this.manifestPath, "utf8");
      return JSON.parse(content) as WindowsAppUpdatesManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { apps: [] };
      }
      throw error;
    }
  }

  private resolveMsiUrl(
    entry: WindowsAppUpdateEntry,
    request?: express.Request,
  ): string | null {
    if (entry.msiUrl?.trim()) {
      return entry.msiUrl.trim();
    }
    if (!entry.msiFile?.trim()) {
      return null;
    }

    const baseUrl = this.resolveBaseUrl(request);
    return `${baseUrl}/downloads/windows/${encodeURIComponent(entry.msiFile.trim())}`;
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

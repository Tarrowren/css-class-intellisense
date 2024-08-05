import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FilePermission, FileStat, FileType, Memento } from "vscode";

interface _CacheItem {
  etag: string;
  fileName: string;
  updateTime: number;
}

type _CacheInfo = Record<string, _CacheItem | undefined>;

export class LocalCache {
  static readonly MEMENTO_KEY = "request-cache";

  private readonly _cacheLocation: string;
  private readonly _globalState: Memento;
  private _info: _CacheInfo;

  constructor(cacheLocation: string, globalState: Memento) {
    this._cacheLocation = cacheLocation;
    this._globalState = globalState;

    const info = this._globalState.get<_CacheInfo>(LocalCache.MEMENTO_KEY, {});
    const validated: _CacheInfo = {};

    for (const uri in info) {
      const item = info[uri];
      if (item) {
        if (typeof item.etag === "string" && typeof item.fileName === "string" && typeof item.updateTime === "number") {
          validated[uri] = { etag: item.etag, fileName: item.fileName, updateTime: item.updateTime };
        }
      }
    }

    this._info = validated;
  }

  async get(uri: string, etag: string, etagValid: boolean) {
    const item = this._info[uri];
    if (item) {
      if (item.etag === etag) {
        return await this.loadFile(uri, item, etagValid);
      } else {
        this.deleteFile(uri, item);
      }
    }
  }

  getETag(uri: string) {
    return this._info[uri]?.etag;
  }

  async getIfUpdatedSince(uri: string, expirationDurationInHours: number) {
    const item = this._info[uri];
    if (item) {
      const lastUpdatedInHours = (Date.now() - item.updateTime) / 1000 / 60 / 60;
      if (lastUpdatedInHours < expirationDurationInHours) {
        return await this.loadFile(uri, item, false);
      }
    }
  }

  async getStatIfUpdatedSince(uri: string, expirationDurationInHours: number) {
    const item = this._info[uri];
    if (item) {
      const lastUpdatedInHours = (Date.now() - item.updateTime) / 1000 / 60 / 60;
      if (lastUpdatedInHours < expirationDurationInHours) {
        return await this.statFile(uri, item, false);
      }
    }
  }

  async put(uri: string, etag: string, content: Uint8Array) {
    try {
      const fileName = this.getCacheFileName(uri);
      await writeFile(join(this._cacheLocation, fileName), content);
      const item: _CacheItem = { etag, fileName, updateTime: Date.now() };
      this._info[uri] = item;
    } catch (_e) {
      delete this._info[uri];
    } finally {
      await this.updateMemento();
    }
  }

  async clearCache() {
    const uris = Object.keys(this._info);
    try {
      const files = await readdir(this._cacheLocation);
      for (const file of files) {
        try {
          await unlink(join(this._cacheLocation, file));
        } catch (_e) {
          // ignore
        }
      }
    } catch (_e) {
      // ignore
    } finally {
      this._info = {};
      await this.updateMemento();
    }
    return uris;
  }

  private async loadFile(uri: string, item: _CacheItem, isUpdated: boolean) {
    try {
      const content = await readFile(join(this._cacheLocation, item.fileName));
      if (isUpdated) {
        item.updateTime = Date.now();
        await this.updateMemento();
      }
      return content;
    } catch (_e) {
      delete this._info[uri];
      await this.updateMemento();
    }
  }

  private async statFile(uri: string, item: _CacheItem, isUpdated: boolean) {
    try {
      const stats = await stat(join(this._cacheLocation, item.fileName));
      if (isUpdated) {
        item.updateTime = Date.now();
        await this.updateMemento();
      }
      const fileStat: FileStat = {
        ctime: stats.ctime.getTime(),
        mtime: stats.mtime.getTime(),
        size: stats.size,
        type: FileType.File,
        permissions: FilePermission.Readonly,
      };
      return fileStat;
    } catch (_e) {
      delete this._info[uri];
      await this.updateMemento();
    }
  }

  private async deleteFile(uri: string, item: _CacheItem) {
    delete this._info[uri];
    await this.updateMemento();
    try {
      await rm(join(this._cacheLocation, item.fileName));
    } catch (_e) {
      // ignore
    }
  }

  private async updateMemento() {
    try {
      await this._globalState.update(LocalCache.MEMENTO_KEY, this._info);
    } catch (_e) {
      // ignore
    }
  }

  private getCacheFileName(uri: string) {
    return createHash("MD5").update(uri).digest("hex");
  }
}

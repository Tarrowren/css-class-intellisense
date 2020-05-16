import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as nodeURL from "url";
import { connection, globalSettings } from "./server";

interface CacheFileResult {
    type: "text" | "path";
    content: string;
}

export async function downloadText(
    uri: string,
    mode: "http" | "https"
): Promise<string> {
    const cachePath = globalSettings.remoteCSSCachePath;
    let cacheFile: CacheFileResult | undefined;
    if (cachePath !== "") {
        cacheFile = await getCacheFile(uri, cachePath);
        if (cacheFile.type === "text") {
            return cacheFile.content;
        }
    }

    const request = mode === "http" ? http : https;
    return new Promise<string>((resolve, reject) => {
        let temp = "";
        request
            .get(uri, async (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`code ${res.statusCode}, ${uri}`));
                }
                const progress = await connection.window.createWorkDoneProgress();
                const contentLength = res.headers["content-length"];
                if (!contentLength) {
                    reject(new Error(`content-length is undefined, ${uri}`));
                }
                const len = parseInt(contentLength!);

                progress.begin(
                    `download ${uri}`,
                    0,
                    "",
                    !globalSettings.silentDownload
                );

                res.on("data", (data) => {
                    temp += data;
                    progress.report((100 * temp.length) / len);
                }).on("end", async () => {
                    progress.done();
                    if (res.complete) {
                        if (cacheFile && cacheFile.type === "path") {
                            await fs.promises.mkdir(
                                path.dirname(cacheFile.content),
                                {
                                    recursive: true,
                                }
                            );
                            await fs.promises.writeFile(
                                cacheFile.content,
                                temp
                            );
                        }
                        resolve(temp);
                    } else {
                        resolve("");
                    }
                });

                progress.token.onCancellationRequested(() => {
                    res.destroy();
                });
            })
            .on("error", (e) => {
                reject(e);
            });
    });
}

async function getCacheFile(
    uri: string,
    cachePath: string
): Promise<{ type: "text" | "path"; content: string }> {
    const url = nodeURL.parse(uri);
    const cacheFilePath = path.join(
        cachePath,
        url.hostname ?? "",
        url.pathname ?? ""
    );
    try {
        return {
            type: "text",
            content: (await fs.promises.readFile(cacheFilePath)).toString(),
        };
    } catch (err) {
        connection.console.log(
            `Failed to open file, redownload ${cacheFilePath}.`
        );
        return {
            type: "path",
            content: cacheFilePath,
        };
    }
}

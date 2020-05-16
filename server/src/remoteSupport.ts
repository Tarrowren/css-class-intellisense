import * as http from "http";
import * as https from "https";
import { connection } from "./server";

export function downloadText(uri: string, mode: "http" | "https") {
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

                progress.begin(`download ${uri}`, 0, "", true);

                res.on("data", (data) => {
                    temp += data;
                    progress.report((100 * temp.length) / len);
                }).on("end", () => {
                    progress.done();
                    if (res.complete) {
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

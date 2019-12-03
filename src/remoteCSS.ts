import * as fs from "fs";
import * as path from "path";
import * as request from "request";
import { CompletionItem, workspace, window } from "vscode";
import { TextDocument } from "vscode-css-languageservice";
import { CSSDocAnalysisService } from "./cssDocAnalysisService";

export interface RemoteCSSAnalysisSerivce {
    getAllCompletionItems(urls: string[]): Promise<CompletionItem[]>;
}

export class RemoteCSSAnalysisRepo implements RemoteCSSAnalysisSerivce {
    private remoteCSSFolderPath: string = "";
    private remoteCSSFileJSONPath: string = "";
    private remoteCSSDoc: RemoteCSSDoc[] = [];
    private remoteCSSAnalysis: RemoteCSSAnalysis[] = [];
    private cssAnalysisService: CSSDocAnalysisService;

    constructor(cssAnalysisService: CSSDocAnalysisService) {
        this.cssAnalysisService = cssAnalysisService;
    }

    public getAllCompletionItems(urls: string[]): Promise<CompletionItem[]> {
        this.refresh();
        return urls.map(async url => {
            let analysis = this.remoteCSSAnalysis.find(r => r.getURL() === url);
            if (analysis === undefined) {
                analysis = await this.findRemoteCSSDocAndAnalysis(url);
            }
            return analysis.getCompletionItems();
        }).reduce(async (total, current) => (await total).concat(await current));
    }

    private async refresh(): Promise<void> {
        let folderPath = path.join(this.getRootPath(), "./remote_css");
        if (this.remoteCSSFolderPath !== folderPath) {
            this.remoteCSSFolderPath = folderPath;
            // console.log("刷新123123");
            this.remoteCSSAnalysis = [];
        }
        this.remoteCSSFileJSONPath = path.join(this.remoteCSSFolderPath, "./remoteCSSFile.json");

        let folderExists: boolean = await new Promise(resolve => fs.exists(this.remoteCSSFolderPath, e => resolve(e)));
        let fileExists: boolean = await new Promise(resolve => fs.exists(this.remoteCSSFileJSONPath, e => resolve(e)));
        let err: NodeJS.ErrnoException | null;
        // 不存在则创建
        if (!folderExists) {
            err = await new Promise(reject => fs.mkdir(this.remoteCSSFolderPath, err => reject(err)));
            if (err) {
                throw err;
            }
        }
        if (!fileExists) {
            err = await new Promise(reject => fs.writeFile(this.remoteCSSFileJSONPath, "{}", err => reject(err)));
            if (err) {
                throw err;
            }
        }
        let jsonDoc = await workspace.openTextDocument(this.remoteCSSFileJSONPath);
        if (jsonDoc.getText() !== "") {
            this.remoteCSSDoc = JSON.parse(jsonDoc.getText());
        } else {
            this.remoteCSSDoc = [];
        }
    }

    // 在本地查找下载的远程文件
    private async findRemoteCSSDocAndAnalysis(url: string): Promise<RemoteCSSAnalysis> {
        let doc = this.remoteCSSDoc.find(r => r.getURL() === url);
        if (doc === undefined) {
            doc = await this.saveRemoteCSSDoc(url);
            this.remoteCSSDoc.push(doc);
            // 使用json文件保存远程CSS信息
            let err: NodeJS.ErrnoException | null = await new Promise(reject => fs.writeFile(this.remoteCSSFileJSONPath, JSON.stringify(this.remoteCSSDoc, null, "\t"), err => reject(err)));
            if (err) {
                throw err;
            }
        }
        let textDoc = await workspace.openTextDocument(doc.getFilename());
        let cssDoc = TextDocument.create(textDoc.uri.fsPath, textDoc.languageId, textDoc.version, textDoc.getText());
        return new RemoteCSSAnalysis(doc, this.cssAnalysisService.TextDocAnalysis(cssDoc));
    }

    // 保存新的远程CSS文档
    private async saveRemoteCSSDoc(url: string): Promise<RemoteCSSDoc> {
        let filename = Date.now() + ".css";
        // 下载文件
        return new Promise(resolve => {
            request(url).pipe(fs.createWriteStream(filename)).on("close", () => resolve(new RemoteCSSDoc(filename, url)));
        });
    }

    // 获取当前打开文件的根目录
    private getRootPath(): string {
        let editor = window.activeTextEditor;
        if (editor === undefined) {
            throw new Error("No Active Text Editor");
        }
        let docPath = editor.document.uri.fsPath;
        let folders = workspace.workspaceFolders;
        if (folders === undefined) {
            throw new Error("No WorkspaceFolders");
        }
        for (let folder of folders) {
            if (docPath.indexOf(folder.uri.fsPath) === 0) {
                return folder.uri.fsPath;
            }
        }
        throw new Error("Unknown");
    }
}

class RemoteCSSDoc {
    private filename: string;
    private url: string;

    constructor(filename: string, url: string) {
        this.filename = filename;
        this.url = url;
    }

    getFilename(): string {
        return this.filename;
    }

    getURL(): string {
        return this.url;
    }
}

class RemoteCSSAnalysis {
    private remoteCSSDoc: RemoteCSSDoc;
    private completionItems: Promise<CompletionItem[]>;

    constructor(remoteCSSDoc: RemoteCSSDoc, completionItems: Promise<CompletionItem[]>) {
        this.remoteCSSDoc = remoteCSSDoc;
        this.completionItems = completionItems;
    }

    getURL(): string {
        return this.remoteCSSDoc.getURL();
    }

    getCompletionItems(): Promise<CompletionItem[]> {
        return this.completionItems;
    }
}

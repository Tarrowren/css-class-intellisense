export interface Runtime {
  request: RequestService;
}

export interface RequestService {
  getContent(uri: string): Promise<string>;
}

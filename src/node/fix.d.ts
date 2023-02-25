export {};

declare global {
  type Blob = any;
  type File = any;
  type FormData = any;

  var Blob: any;
  var File: any;
}

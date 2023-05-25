import { CssConfigOptions } from "../css-config";

export const validate: {
  (data: unknown): data is CssConfigOptions;
  errors: ErrorObject[] | null | undefined;
};

export interface ErrorObject {
  message?: string;
}

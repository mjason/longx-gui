import {
  checkForPackage,
  checkForUpdate,
  downloadPackage,
  downloadUpdate,
  installAndRestart,
  restartToPackage,
  shellInfo,
} from "nsh/updater";
import { createUpdateState } from "./updateState";

/** App-wide: the native updater permits one operation at a time, including across windows. */
export const appUpdates = createUpdateState({
  supported: () => !!shellInfo().version,
  checkForPackage,
  checkForUpdate,
  downloadPackage,
  downloadUpdate,
  installAndRestart,
  restartToPackage,
});

import { coreExtensions } from "./core";
import { blockExtensions } from "./blocks";
import { mediaExtensions } from "./media";
import { advancedExtensions } from "./advanced";

const extensions = [
  ...coreExtensions,
  ...blockExtensions,
  ...mediaExtensions,
  ...advancedExtensions,
];

export default extensions;

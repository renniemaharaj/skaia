import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const testAtom = atomWithStorage<any>("test", null);
// just checking types

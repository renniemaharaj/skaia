import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";

const testAtom = atomWithStorage<any>("test", null);
// just checking types

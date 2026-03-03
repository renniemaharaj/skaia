import { atom } from "jotai";

export interface OnlineUser {
  user_id: number;
  user_name: string;
  avatar: string;
  route: string;
}

/** All online users broadcast from the server (first 100). */
export const onlineUsersAtom = atom<OnlineUser[]>([]);

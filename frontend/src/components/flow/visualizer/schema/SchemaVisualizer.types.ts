export type Model = {
  name: string;
  fields: {
    name: string;
    type: string;
    comments?: Comment[];
    hasConnections?: boolean;
  }[];
  isChild?: boolean;
};

export type Comment = {
  text: string;
};

export type ModelConnection = {
  target: string;
  source: string;
  name: string;
};

import { makeProject, type Project as TwickProject } from '@twick/core';
import { getActiveEffectsForFrame } from '@twick/effects';
import { scene } from '@twick/visualizer/src';
import projectJson from './project.json';

type RenderProject = {
  input?: {
    properties?: {
      width?: number;
      height?: number;
      fps?: number;
    };
    tracks?: unknown[];
    [key: string]: unknown;
  };
  properties?: {
    width?: number;
    height?: number;
    fps?: number;
  };
  tracks?: unknown[];
  backgroundColor?: string;
  watermark?: unknown;
  [key: string]: unknown;
};

const rawProject = projectJson as RenderProject;
const input = rawProject.input ?? rawProject;
const width = input.properties?.width ?? 1920;
const height = input.properties?.height ?? 1080;
const fps = input.properties?.fps ?? 30;

const project = makeProject({
  scenes: [scene],
  variables: {
    input,
    playerId: 'skaia-export',
  },
  settings: {
    shared: {
      size: { x: width, y: height },
    },
    rendering: {
      fps,
    },
    preview: {
      fps,
    },
  },
});

(project as TwickProject).getActiveEffectsForFrame = getActiveEffectsForFrame;

export default project;

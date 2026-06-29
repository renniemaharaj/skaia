import { makeProject } from '@twick/core';
import { Project } from '@twick/player-react';
import * as React from 'react';
import projectJson from './project.json';

export default makeProject({
  id: 'exported-project',
  name: 'Exported Project',
  components: [
    {
      id: 'main',
      component: () => React.createElement(Project, { project: projectJson }),
      props: {},
      durationInFrames: projectJson.durationInFrames || 300,
      fps: projectJson.fps || 30,
      width: projectJson.videoResolution?.width || 1920,
      height: projectJson.videoResolution?.height || 1080,
    }
  ]
});

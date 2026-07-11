export const projectDurationSeconds = (project: any): number => {
  const input = project?.input ?? project;
  const tracks = Array.isArray(input?.tracks) ? input.tracks : [];
  let duration = 0;
  tracks.forEach((track: any) => {
    const elements = Array.isArray(track?.elements) ? track.elements : [];
    elements.forEach((element: any) => {
      const end = typeof element?.e === "number" ? element.e : 0;
      duration = Math.max(duration, end);
    });
  });
  return duration;
};

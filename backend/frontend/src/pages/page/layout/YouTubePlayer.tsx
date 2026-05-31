import React, { useRef, useEffect } from "react";
import YouTube from "react-youtube";
import type { YouTubeProps } from "react-youtube";

interface PlayerProps {
  videoId: string;
  isPaused: boolean;
  currentPosition: number;
  updatedAt: string;
  onEnded: () => void;
}

export interface YouTubePlayerRef {
  getCurrentTime: () => Promise<number>;
  getDuration: () => Promise<number>;
}

const YouTubePlayer = React.memo(React.forwardRef<YouTubePlayerRef, PlayerProps>(({ videoId, isPaused, currentPosition, updatedAt, onEnded }, ref) => {
  const playerRef = useRef<any>(null);

  React.useImperativeHandle(ref, () => ({
    getCurrentTime: async () => {
      if (playerRef.current && playerRef.current.getCurrentTime) return await playerRef.current.getCurrentTime();
      return 0;
    },
    getDuration: async () => {
      if (playerRef.current && playerRef.current.getDuration) return await playerRef.current.getDuration();
      return 0;
    }
  }));

  const onReady: YouTubeProps["onReady"] = (event) => {
    playerRef.current = event.target;
    
    // Calculate current position
    let seekTo = currentPosition;
    if (!isPaused && updatedAt) {
      const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 1000;
      seekTo += elapsed;
    }
    event.target.seekTo(seekTo, true);

    if (isPaused) {
      event.target.pauseVideo();
    } else {
      event.target.playVideo();
    }
  };

  const onStateChange: YouTubeProps["onStateChange"] = (event) => {
    // State 0 = ended
    if (event.data === 0) {
      onEnded();
    }
  };

  // Keep track of parent's pause state vs internal state to prevent loop
  useEffect(() => {
    if (playerRef.current) {
      if (isPaused) {
        playerRef.current.pauseVideo();
      } else {
        // Only seek if we're resuming and it's a new update? No, let's keep it simple.
        // Actually, on sync, we only want to seek if it's the initial load.
        playerRef.current.playVideo();
      }
    }
  }, [isPaused]);

  if (!videoId) return null;

  return (
    <div className="vp-iframe-wrapper">
      <YouTube
        videoId={videoId}
        opts={{
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 1,
            controls: 1,
          },
        }}
        onReady={onReady}
        onStateChange={onStateChange}
        className="vp-youtube-container"
        iframeClassName="vp-youtube-iframe"
      />
    </div>
  );
}));

export default YouTubePlayer;

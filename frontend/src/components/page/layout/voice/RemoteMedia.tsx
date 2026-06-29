import { useEffect, useRef, useState } from "react";

export const RemoteMedia = ({
  stream,
  volume,
  objectFit = "cover",
  isModal = false,
}: {
  stream: MediaStream;
  volume: number;
  objectFit?: "cover" | "contain";
  isModal?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(stream.getVideoTracks().length > 0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const checkVideo = () => setHasVideo(stream.getVideoTracks().length > 0);
    stream.addEventListener("addtrack", checkVideo);
    stream.addEventListener("removetrack", checkVideo);
    return () => {
      stream.removeEventListener("addtrack", checkVideo);
      stream.removeEventListener("removetrack", checkVideo);
    };
  }, [stream]);

  if (!hasVideo) {
    return <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />;
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={!isModal && !isHovered}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: "100%", height: "100%", objectFit, display: "block" }}
    />
  );
};

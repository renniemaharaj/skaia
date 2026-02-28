import { Instagram, MessageCircle, Twitter } from "lucide-react";
import React from "react";

interface SocialLink {
  name: string;
  icon: React.ReactNode;
  link: string;
}

export const SocialLinks = () => {
  const socialLinks: SocialLink[] = [
    {
      name: "Discord",
      icon: <MessageCircle size={20} />,
      link: "https://discord.gg/Ngt4RkNUNv",
    },
    {
      name: "X",
      icon: <Twitter size={20} />,
      link: "https://x.com/SkaiaGaming",
    },
    {
      name: "Instagram",
      icon: <Instagram size={20} />,
      link: "https://www.instagram.com/skaiagram/",
    },
  ];

  return (
    <div className="social-links">
      {socialLinks.map((social, index) => (
        <a
          key={index}
          href={social.link}
          target="_blank"
          rel="noopener noreferrer"
          className="social-link"
          title={social.name}
        >
          {social.icon}
        </a>
      ))}
    </div>
  );
};

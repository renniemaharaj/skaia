import {
  ShoppingCart,
  MessageCircle,
  CheckCircle,
  Users,
  Star,
  Gamepad2,
  TrendingUp,
  // Github,
  Twitter,
} from "lucide-react";
import { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
import { SkeletonCard } from "./SkeletonCard";
import "./Landing.css";

interface StatItem {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

interface SocialLink {
  name: string;
  icon: React.ReactNode;
  link: string;
}

export const Landing: React.FC = () => {
  // const navigate = useNavigate();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<StatItem[]>([]);

  useEffect(() => {
    // Simulate 5-second load delay for testing skeleton cards
    const timer = setTimeout(() => {
      const statsData: StatItem[] = [
        {
          label: "Server Status",
          value: "Online",
          icon: <CheckCircle size={32} color="green" />,
        },
        {
          label: "Players Online",
          value: 47,
          icon: <Users size={32} />,
        },
        {
          label: "Monthly Goal",
          value: "75% funded",
          icon: <TrendingUp size={32} />,
        },
        {
          label: "Last Supporter",
          value: "CreeperSlayer92",
          icon: <Star size={32} />,
        },
        {
          label: "Discord Members",
          value: "892 members",
          icon: <MessageCircle size={32} />,
        },
      ];
      setStats(statsData);
      setStatsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  const socialLinks: SocialLink[] = [
    {
      name: "Discord",
      icon: <MessageCircle size={20} />,
      link: "https://discord.gg/cueballcraft",
    },
    {
      name: "X",
      icon: <Twitter size={20} />,
      link: "https://x.com/SkaiaGaming",
    },
    // {
    //   name: "GitHub",
    //   icon: <Github size={20} />,
    //   link: "https://github.com/cueballcraft",
    // },
  ];

  return (
    <div className="landing-container">
      {/* Hero Banner Section */}
      <section className="hero-banner">
        <img
          src="/banner_7783x7783.png"
          alt="Cueballcraft Skaiacraft"
          className="banner-image"
        />
        <div className="banner-overlay">
          <div className="banner-content">
            <h1>CUEBALLCRAFT SKAIACRAFT</h1>
            <p>A Premium Vanilla Minecraft Experience</p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stats-container">
          {statsLoading ? (
            <SkeletonCard count={3} />
          ) : (
            stats.map((stat, index) => (
              <div key={index} className="stat-card">
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-text">
                  <h3>{stat.label}</h3>
                  <p>{stat.value}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Social Links */}
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
      </section>

      {/* Showcase Section */}
      <section className="showcase">
        <div className="section-header">
          <h2>Explore the Server</h2>
          <p>Discover amazing builds and landscapes</p>
        </div>
        <div className="showcase-grid">
          <div className="showcase-item">
            <img src="/fullscreen_mansion.webp" alt="Server Mansion" />
            <div className="showcase-overlay">
              <h3>Epic Builds</h3>
            </div>
          </div>
          <div className="showcase-item">
            <img src="/fullscreen_pathway.webp" alt="Server Pathway" />
            <div className="showcase-overlay">
              <h3>Grand Pathways</h3>
            </div>
          </div>
          <div className="showcase-item">
            <img src="/fullscreen_tree.webp" alt="Server Tree" />
            <div className="showcase-overlay">
              <h3>Natural Beauty</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="section-header">
          <h2>What can you expect from Cueballcraft, Skaiacraft</h2>
          <p>
            Everything you need for the ultimate vanilla Minecraft experience!
          </p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Gamepad2 size={24} />
            </div>
            <h3>Partial Vanilla</h3>
            <p>Enjoy authentic Minecraft gameplay with custom enhancements</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <TrendingUp size={24} />
            </div>
            <h3>Latest Versions</h3>
            <p>
              Support for the newest Minecraft versions on our custom framework
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Users size={24} />
            </div>
            <h3>Loyal Community</h3>
            <p>Join a welcoming playerbase with experienced staff members</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Star size={24} />
            </div>
            <h3>Custom Apps</h3>
            <p>Unique features and tools designed for enjoyment</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <CheckCircle size={24} />
            </div>
            <h3>Reliable Support</h3>
            <p>Helpful moderators ready to assist with any questions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <ShoppingCart size={24} />
            </div>
            <h3>Premium Items</h3>
            <p>Shop for ranks, cosmetics, and exclusive content</p>
          </div>
        </div>
      </section>

      {/* Community Legacy Section */}
      <section className="community-legacy">
        <div className="section-header">
          <h2>12+ Years of Community Excellence</h2>
          <p>A Legacy Built on Trust, Inclusivity, and Fun</p>
        </div>
        <div className="community-info">
          <div className="info-card">
            <h3>Established & Trusted</h3>
            <p>
              Over 12 years of continuous operation with a dedicated community
              of players who believe in authentic Minecraft experiences.
            </p>
          </div>
          <div className="info-card">
            <h3>Family Friendly</h3>
            <p>
              We maintain a welcoming, family-oriented environment where players
              of all ages can enjoy safe and inclusive gameplay.
            </p>
          </div>
          <div className="info-card">
            <h3>Strong Community</h3>
            <p>
              Our players have built lasting friendships and memories together,
              creating a thriving community that grows every day.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {/* <section className="cta">
        <div className="cta-content">
          <h2>Ready to Join an Epic Adventure?</h2>
          <p>Start your journey on Cueballcraft Skaiacraft today</p>
          <div className="cta-buttons">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate("/store")}
            >
              Get Started
            </button>
            <a href="#" className="btn btn-secondary btn-lg">
              Learn More
            </a>
          </div>
        </div>
      </section> */}
    </div>
  );
};

import "./Footer.css";
import SocialLinks from "./SocialLinks";

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Cueballcraft Skaiacraft</h3>
          <p>
            A premium vanilla Minecraft server with a community spanning over 12
            years
          </p>
        </div>

        <div className="footer-section">
          <h4>Community</h4>
          <ul>
            <li>Family Friendly Environment</li>
            <li>Support for All Clients</li>
            <li>Active Moderation</li>
            <li>Welcoming to New Players</li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Connect</h4>
          <SocialLinks />
        </div>
      </div>

      <div className="footer-bottom">
        <p>
          &copy; {currentYear} Cueballcraft Skaiacraft. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

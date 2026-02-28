export const Hero = ({ height }: { height?: string }) => {
  return (
    <section
      style={{
        height: height,
      }}
      className="hero-banner"
    >
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
  );
};

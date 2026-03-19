const Hero = ({ height }: { height?: string }) => {
  return (
    <section
      style={{
        height: height,
      }}
      className="hero-banner"
    >
      <div className="banner-overlay">
        <div className="banner-content">
          <div
            className="skeleton"
            style={{ width: 200, height: 28, margin: "0 auto 12px" }}
          />
          <div
            className="skeleton"
            style={{ width: 300, height: 16, margin: "0 auto" }}
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;

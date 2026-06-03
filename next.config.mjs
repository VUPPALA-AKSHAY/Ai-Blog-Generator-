const nextConfig = {
  transpilePackages: ["tegaki"],
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.ttf$/,
      type: "asset/resource",
      generator: {
        filename: 'static/media/[name].[hash][ext]',
        emit: !isServer
      }
    });
    return config;
  }
};

export default nextConfig;

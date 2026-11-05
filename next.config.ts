import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버(npm run dev)는 localhost가 아닌 주소로 열면 화면을 움직이는 스크립트를 막는다.
  // http://127.0.0.1:3000 으로 열었을 때 대화가 먹통이 되던 원인이라 이 주소도 허용한다.
  // (같은 와이파이의 다른 기기에서 열려면 그 기기가 접속하는 주소(예: 192.168.0.12)를 여기에 더한다)
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

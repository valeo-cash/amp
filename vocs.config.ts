import { defineConfig } from "vocs";

export default defineConfig({
  title: "AMP",
  titleTemplate: "%s — AMP Protocol",
  description: "Persistent payment channels for AI agents on Solana",
  logoUrl: "/logo.svg",
  iconUrl: "/favicon.svg",
  rootDir: "docs",
  baseUrl: "https://amp.valeoprotocol.io",
  editLink: {
    pattern:
      "https://github.com/valeo-cash/amp/edit/main/docs/pages/:path",
    text: "Suggest changes",
  },
  checkDeadlinks: "warn",
  socials: [
    {
      icon: "github",
      link: "https://github.com/valeo-cash/amp",
    },
  ],
  topNav: [
    { text: "Docs", link: "/overview", match: "/overview" },
    { text: "Services", link: "/services" },
    {
      text: "GitHub",
      link: "https://github.com/valeo-cash/amp",
    },
  ],
  sidebar: [
    {
      text: "Introduction",
      items: [
        { text: "Overview", link: "/overview" },
        {
          text: "Full Spec",
          link: "https://github.com/valeo-cash/amp/blob/main/SPEC.md",
        },
        { text: "FAQ", link: "/faq" },
        { text: "Build with an LLM", link: "/guides/building-with-an-llm" },
      ],
    },
    {
      text: "Quick Start",
      items: [
        { text: "Overview", link: "/quickstart" },
        { text: "Add payments to your API", link: "/quickstart/server" },
        { text: "Use with agents", link: "/quickstart/agent" },
      ],
    },
    {
      text: "Guides",
      items: [
        { text: "Accept per-call payments", link: "/guides/per-call" },
        { text: "Accept streaming payments", link: "/guides/streaming" },
        { text: "Accept delegated payments", link: "/guides/delegation" },
        { text: "Channel chaining", link: "/guides/chaining" },
      ],
    },
    {
      text: "Protocol",
      items: [
        { text: "Overview", link: "/protocol" },
        { text: "Channels", link: "/protocol/channels" },
        { text: "Metering", link: "/protocol/metering" },
        { text: "Settlement", link: "/protocol/settlement" },
        { text: "Delegation", link: "/protocol/delegation" },
        {
          text: "Transports",
          items: [
            { text: "HTTP", link: "/protocol/transports/http" },
            { text: "MCP and JSON-RPC", link: "/protocol/transports/mcp" },
            { text: "WebSocket", link: "/protocol/transports/websocket" },
            { text: "gRPC", link: "/protocol/transports/grpc" },
          ],
        },
      ],
    },
    {
      text: "On-Chain",
      items: [
        { text: "Overview", link: "/on-chain" },
        { text: "Program", link: "/on-chain/program" },
        { text: "Channel State", link: "/on-chain/channel-state" },
        { text: "Instructions", link: "/on-chain/instructions" },
      ],
    },
    {
      text: "Ecosystem",
      items: [
        { text: "Service Registry", link: "/ecosystem/registry" },
        { text: "On-Chain Reputation", link: "/ecosystem/reputation" },
        { text: "Multi-Channel Netting", link: "/ecosystem/stratum" },
      ],
    },
    {
      text: "SDKs",
      items: [
        { text: "Overview", link: "/sdk" },
        { text: "TypeScript", link: "/sdk/typescript" },
      ],
    },
    {
      text: "Resources",
      items: [
        { text: "Comparison (x402 vs MPP)", link: "/comparison" },
        { text: "Brand", link: "/brand" },
      ],
    },
  ],
  theme: {
    accentColor: "#000000",
    variables: {
      color: {
        background: {
          dark: "#0a1628",
        },
      },
    },
  },
});

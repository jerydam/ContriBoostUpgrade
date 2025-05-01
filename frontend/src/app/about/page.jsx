import AboutClient from "./aboutClient";

export const generateMetadata = () => {
  return {
    title: "About | Contriboost",
    description: "Learn about Contriboost, a decentralized platform for community savings and funding.",
  };
};

export default function About() {
  return <AboutClient />;
}
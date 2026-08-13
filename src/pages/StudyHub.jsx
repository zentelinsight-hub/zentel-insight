import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function StudyHub() {
  return (
    <div className="studyhub-page">
      <Navbar brand="studyhub" />
      <main className="page-enter">
        <Outlet />
      </main>
      <Footer brand="studyhub" />
    </div>
  );
}

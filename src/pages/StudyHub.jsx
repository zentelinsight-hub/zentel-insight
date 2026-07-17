import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function StudyHub() {
  return (
    <div className="studyhub-page">
      <Navbar brand="studyhub" />
      <main className="page-enter">
        <Outlet />
      </main>
    </div>
  );
}

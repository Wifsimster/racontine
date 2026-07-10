import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import Login from "./pages/Login";
import Timeline from "./pages/Timeline";
import Capture from "./pages/Capture";
import Review from "./pages/Review";
import Share from "./pages/Share";
import Invite from "./pages/Invite";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  // Réception d'invitation : accessible sans session (le token est la capacité).
  { path: "/invite/:token", element: <Invite /> },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Timeline /> },
      { path: "capture", element: <Capture /> },
      { path: "entries/:id", element: <Review /> },
      { path: "partage", element: <Share /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

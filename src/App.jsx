import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LoaderProvider } from "./context/LoaderContext";
import { PeopleProvider } from "./context/PeopleContext";
import { PostsProvider } from "./hooks/usePosts";
import AppRoutes from "./routes/AppRoutes";
import InstallPrompt from "./components/pwa/InstallPrompt";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <LoaderProvider>
          <PeopleProvider>
            <PostsProvider>
              <div className="bg-blob blob-1" />
              <div className="bg-blob blob-2" />
              <div className="bg-blob blob-3" />
              <div id="app">
                <AppRoutes />
                <InstallPrompt />
              </div>
            </PostsProvider>
          </PeopleProvider>
        </LoaderProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

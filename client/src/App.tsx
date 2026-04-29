import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<div className="py-20 text-center">Home - Coming Soon</div>} />
            <Route path="/tournaments" element={<div className="py-20 text-center">Tournaments - Coming Soon</div>} />
            <Route path="/teams" element={<div className="py-20 text-center">Teams - Coming Soon</div>} />
            <Route path="/about" element={<div className="py-20 text-center">About - Coming Soon</div>} />
            <Route path="/login" element={<div className="py-20 text-center">Login - Coming Soon</div>} />
            <Route path="/register" element={<div className="py-20 text-center">Register - Coming Soon</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
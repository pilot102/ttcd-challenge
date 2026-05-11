import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Ladder from './pages/Ladder'
import PlayerProfile from './pages/PlayerProfile'
import EnterResult from './pages/EnterResult'
import Admin from './pages/Admin'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Ladder />} />
        <Route path="/player/:id" element={<PlayerProfile />} />
        <Route path="/result" element={<EnterResult />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

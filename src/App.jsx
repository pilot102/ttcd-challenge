import { HashRouter, Routes, Route } from 'react-router-dom'
import Ladder from './pages/Ladder'
import PlayerProfile from './pages/PlayerProfile'
import EnterResult from './pages/EnterResult'
import Admin from './pages/Admin'
import './App.css'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Ladder />} />
        <Route path="/player/:id" element={<PlayerProfile />} />
        <Route path="/result" element={<EnterResult />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </HashRouter>
  )
}

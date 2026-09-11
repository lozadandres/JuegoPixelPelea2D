import { Routes, Route } from 'react-router'
import FightGame from './components/FightGame'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FightGame />} />
    </Routes>
  )
}

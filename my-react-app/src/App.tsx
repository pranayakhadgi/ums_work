import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Button } from './components/ui/button';
import { useAppStore } from './store';

function Home() {
  const { count, increment, decrement } = useAppStore();

  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Home</h1>
      <p className='mb-4'>Count: {count}</p>
      <Button onClick={increment} className='mr-2'>Increment</Button>
      <Button onClick={decrement}>Decrement</Button>
    </div>
  );
}

function About() {
  return <div className='p-4'>
    <h1 className='text-2xl font-bold'>About</h1>
  </div>;
}

function App() {
  return (
    <Router>
      <div className='p-4'>
        <nav className='mb-4'>
          <Link to='/' className='mr-4'>Home</Link>
          <Link to='/about'>About</Link>
        </nav>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/about' element={<About />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
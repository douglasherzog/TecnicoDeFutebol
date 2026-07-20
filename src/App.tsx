import { MainMenu } from './components/MainMenu';
import { NewGame } from './components/TeamSelect';
import { Dashboard } from './components/Dashboard';
import { EndSeason } from './components/EndSeason';

function App() {
  return (
    <>
      <MainMenu />
      <NewGame />
      <Dashboard />
      <EndSeason />
    </>
  );
}

export default App;

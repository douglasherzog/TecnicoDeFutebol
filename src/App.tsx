import { MainMenu } from './components/MainMenu';
import { NewGame } from './components/TeamSelect';
import { Dashboard } from './components/Dashboard';
import { PreMatchView } from './components/PreMatchView';
import { LiveMatchView } from './components/LiveMatchView';
import { PostMatchView } from './components/PostMatchView';
import { EndSeason } from './components/EndSeason';

function App() {
  return (
    <>
      <MainMenu />
      <NewGame />
      <Dashboard />
      <PreMatchView />
      <LiveMatchView />
      <PostMatchView />
      <EndSeason />
    </>
  );
}

export default App;

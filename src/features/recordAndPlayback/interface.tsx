import React, { useState } from 'react';
import { Player } from './player';
import { clearEvents, getEvents } from './storage';

export const RecordAndPlayback: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const player = new Player();

  const handleToggleRecording = () => {
    if (isRecording) {
      chrome.runtime.sendMessage({ action: 'stopRecording' });
      setIsRecording(false);
    } else {
      chrome.runtime.sendMessage({ action: 'startRecording' });
      setIsRecording(true);
    }
  };

  const handlePlay = async () => {
    setIsPlaying(true);
    await player.loadEvents();
    player.play();
    // This is a simplified approach. In a real app,
    // you'd want to get status updates from the player.
    setIsPlaying(false);
  };

  const handleExport = async () => {
    const events = await getEvents();
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'recorded_events.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleClear = async () => {
    await clearEvents();
    alert('All recorded data has been cleared.');
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Record & Playback</h2>
      <div className="space-y-2">
        <button
          onClick={handleToggleRecording}
          className="w-full px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
        <button
          onClick={handlePlay}
          disabled={isRecording || isPlaying}
          className="w-full px-4 py-2 text-white bg-green-500 rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {isPlaying ? 'Playing...' : 'Start Playback'}
        </button>
        <button
          onClick={handleExport}
          className="w-full px-4 py-2 text-white bg-gray-500 rounded hover:bg-gray-600"
        >
          Export to JSON
        </button>
        <button
          onClick={handleClear}
          className="w-full px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600"
        >
          Clear Data
        </button>
      </div>
    </div>
  );
};

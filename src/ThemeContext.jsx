import { useState, useEffect } from 'react';
import ThemeContext from './theme-context';

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('app-theme') || 'default');
  
  const themes = [
    { id: 'default', name: 'Office Blue' },
    { id: 'red', name: 'Ruby Red' },
    { id: 'green', name: 'Emerald Green' },
    { id: 'blue', name: 'Ocean Blue' },
    { id: 'pink', name: 'Sakura Pink' },
    { id: 'orange', name: 'Sunset Orange' },
  ];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
};

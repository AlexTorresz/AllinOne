# Histórico do All in One

Hub de jogos estilo console (Electron, Windows). Construído passo a passo em conversa com o Claude.

## v1: a ideia
- Carrossel horizontal minimalista com os jogos da Steam, Epic e GOG detectados no PC.
- Jogos manuais (qualquer `.exe`, com argumentos e capa), favoritos e ocultos.
- Controle (padrão Xbox) e teclado.

## v2: redesign gamer
- Visual novo (sem tons marrons nem serifa), sons sintetizados (Web Audio), filtro da Epic corrigido.
- App empacotado em `.exe` de verdade.

## v3: plataformas
- Pré-carrossel de plataformas (Windows, Switch, PS1 a PS5, PSP, SNES, GBA, Xbox 360/One e mais).
- Teclado na tela operado pelo controle.
- Letras dos botões A/B/X/Y centralizadas.
- Animações de abertura e encerramento, com confirmação ao sair.
- Pasta de ícones para logos oficiais colocados pelo próprio usuário.

## v4: ajustes
- Carrossel circular (do primeiro vai ao último e vice-versa).
- Capa personalizada para qualquer jogo (menu ou arrastar imagem).
- Volta às plataformas ao remover o último jogo; cabeçalho sem quebra de linha.
- Slogan: "Just play all in one". Ícone do app recentralizado.

## v5: Discord Rich Presence
- Cliente do Discord sem dependências (`src/discord.js`) e montagem da presença (`src/presence.js`).
- Modos completo, discreto e desligado; detecção de jogo aberto/fechado (Steam, processo, janela).
- Log de diagnóstico em `%APPDATA%\AllInOne\presence.log` e estado no menu.

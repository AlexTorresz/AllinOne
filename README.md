# All in One

Hub de games estilo console. Reúne Steam, Epic, GOG e jogos instalados à mão em um carrossel só.

## Como usar

**Dê dois cliques em `dist\All in One-win32-x64\All in One.exe`.** Não precisa de Node nem de `.bat`.
Dica: clique com o direito no `.exe` > "Fixar na barra de tarefas" ou crie um atalho na área de trabalho.

Para gerar o `.exe` de novo depois de mudar o código: `construir-exe.bat` (precisa do Node.js).

## Para desenvolver

```
npm install
npm start            # tela cheia
npm run windowed     # em janela
npm run build        # gera dist\All in One-win32-x64\All in One.exe
npm test             # testes dos leitores de Steam/Epic/GOG, biblioteca e Rich Presence
```
(ou `iniciar.bat`, que faz o `npm install` na primeira vez e abre o app)

## Controles

| Teclado | Controle | Ação |
|---|---|---|
| ← → | direcional / analógico | navegar |
| Enter | A | abrir plataforma / jogar |
| F | X | favoritar |
| Tab ou I | Start | menu de opções |
| N | Y | adicionar jogo |
| Q / E | LB / RB | trocar filtro (ou grupo de consoles) |
| PgUp / PgDn | LT / RT | pular uma página |
| R | View | atualizar biblioteca |
| M | — | ligar/desligar a música |
| Esc | B | voltar / fechar |
| F11 | — | alternar tela cheia |
| Ctrl+Q ou fechar a janela | — | sair (pede confirmação) |

Nas listas, ← no primeiro item pula para o último e → no último volta ao primeiro (segurar a tecla para no extremo).
Roda do mouse, clique e o ícone de som no canto também funcionam.

## Plataformas (pré-carrossel)

O app abre num carrossel de **plataformas**: Windows (Steam, Epic, GOG e jogos manuais de PC), Switch, PS1–PS5, PSP,
SNES, GBA, Xbox 360, Xbox One e muitos outros (NES, N64, GameCube, Wii, DS, 3DS, Vita, Mega Drive, Saturn, Dreamcast…).
Entre numa plataforma com **A / Enter**; **B / Esc** volta. **Q / E** trocam o grupo (PC, Nintendo, PlayStation, Xbox, Sega…).
Plataformas sem jogos ficam ocultas; para vê-las, menu > "Consoles sem jogos".

**Ícones das plataformas.** Os ícones que vêm no app são desenhos originais. Para usar os logos oficiais, coloque os arquivos
(`.svg`, `.png`, `.webp`…) em `%APPDATA%\AllInOne\platform-icons\` com o id da plataforma como nome (`switch.svg`, `ps2.png`,
`x360.png`…). O menu > "Ícones das plataformas" abre a pasta, que traz um `LEIA-ME.txt` com todos os ids. O app usa os arquivos na hora.

## Teclado na tela

Nos campos de texto do formulário (nome, executável, argumentos), **A** abre um teclado virtual, sem depender do teclado físico.
Direcional move, **A** digita, **X** apaga, **Y** espaço, **LB/RB** movem o cursor, **View** alterna maiúsculas,
**Start** confirma, **B** cancela. Há camadas de símbolos e acentos.

## Abertura e encerramento

O app abre com uma animação de abertura (pode ser pulada com qualquer botão e desligada no menu > "Animação de abertura")
e encerra com uma animação de saída, sempre depois de uma confirmação ("Sair do All in One?").
Jogos já abertos continuam rodando.

## Som

Todo o áudio é sintetizado pelo próprio programa (nenhum arquivo de som):

- **Música de fundo** ambiente, gerada em tempo real. Ela abaixa quando um jogo abre, cala enquanto você joga e volta quando você retorna ao hub.
- **Cada jogo tem sua própria nota**, que toca ao passar por ele (o mesmo jogo soa igual sempre).
- Sons de confirmar, jogar, voltar, trocar de filtro, abrir o menu, favoritar, erro e abertura.

Música e efeitos podem ser ligados/desligados separadamente no menu (Tab). A escolha fica salva.

## Jogos manuais

Aperte **N** (ou "Adicionar jogo" no menu). Escolha a **plataforma** (Windows, Switch, PS2…), o `.exe`, ajuste o nome se quiser,
e opcionalmente informe argumentos de linha de comando e uma imagem de capa.
Para jogos de console, o executável é o do emulador e os argumentos levam o caminho da ROM/imagem
(ex.: `-f "D:\Roms\jogo.iso"`). O botão "Procurar" abre a janela do Windows, que não é operável pelo controle; use o teclado na tela para digitar o caminho.
Sem capa, o jogo ganha um pôster gerado a partir do nome. Para editar ou remover, abra o menu (Tab) sobre o jogo.
Atalhos `.lnk`, `.bat` e programas que pedem administrador também funcionam.

## Capas

Qualquer jogo (Steam, Epic, GOG ou manual) pode ganhar uma capa sua: menu (Tab / Start) > **Trocar capa** (ou **Adicionar capa**
quando ele ainda não tem), ou **arraste uma imagem** PNG/JPG/WEBP para a janela com o jogo selecionado.
Ela não é trocada pela busca automática. **Remover capa personalizada** volta ao normal (na Steam, o app busca a oficial de novo).
O seletor de arquivos é a janela do Windows, que o controle não opera; use o arrastar ou o teclado/mouse.

## Discord Rich Presence

O perfil do Discord mostra o que você está fazendo no All in One (o Discord precisa estar aberto no PC):

- **Na tela de plataformas:** "Escolhendo o próximo mundo", com frases que se alternam ("Just play all in one"…) e a posição no carrossel ("3 of 8").
- **Dentro de uma plataforma:** "Explorando Nintendo Switch", "Olhando Hades" e a posição na lista.
- **Jogando:** "Jogando Hades", "PC · via Steam" ou o console, com cronômetro. Quando o jogo fecha, volta ao modo de navegação.

**Ativar (uma vez):**
1. Em https://discord.com/developers/applications crie um aplicativo chamado **All in One** (esse nome aparece como "Jogando All in One").
2. Copie o **Application ID** e coloque em `%APPDATA%\AllInOne\config.json`:
   `{ "discordAppId": "123456789012345678" }` (ou me peça para gravá-lo no app).
3. Em **Rich Presence > Art Assets** do mesmo aplicativo, envie as imagens (pelo menos 512×512) com estes nomes:
   `logo` (a grande) e uma por plataforma, com o id como nome: `windows`, `switch`, `ps1`…`ps5`, `psp`, `snes`, `gba`, `x360`, `xone`…
   (os ids estão em `LEIA-ME.txt` da pasta de ícones). Sem imagem, a presença funciona do mesmo jeito, só sem o desenho. Novos assets levam alguns minutos para aparecer.
4. Reinicie o All in One.

No menu (Tab / Start) o item **Discord Rich Presence** alterna entre **completo** (mostra nomes de jogos), **discreto** (só a plataforma, sem nome de jogo) e **desligado**.

Como o app sabe que o jogo fechou: Steam pelo registro do Windows, `.exe` (manual/GOG/emuladores) pelo processo,
e Epic/atalhos pela volta ao All in One depois de 20 s. Nesses últimos a presença pode demorar a voltar ao normal.

## Onde ficam os dados

`%APPDATA%\AllInOne\library.json` (biblioteca, favoritos, jogos manuais) e `%APPDATA%\AllInOne\covers\` (capas).
Para zerar tudo, feche o app e apague essa pasta.

## Estrutura

```
main.js              janela, IPC, abrir jogos
preload.js           ponte segura entre a interface e o main
src/providers/       um módulo por loja: steam, epic, gog (scan() devolve a lista de jogos)
src/library.js       biblioteca em JSON: manuais, favoritos, ocultos, capas
src/discord.js       cliente do Discord Rich Presence (IPC local, sem dependências)
src/presence.js      o que mostrar no Discord + detecção de jogo aberto/fechado
src/covers.js        baixa capas da Steam e extrai a cor do fundo
src/lib/             vdf, argumentos, nomes, PowerShell
renderer/            interface (HTML/CSS/JS puro): app.js (lógica), platforms.js (consoles), osk.js (teclado na tela),
                     cinematic.js (abertura/encerramento), audio.js (som), style.css, fonts/
scripts/build.js     empacota o .exe (Electron + troca do ícone)
build/               ícone do app
test/                node test/parsers.test.js
```

Para suportar outra loja, crie `src/providers/<loja>.js` com um `scan()` e registre em `src/providers/index.js`.

## Como cada loja é detectada

- **Steam:** `libraryfolders.vdf` + `appmanifest_*.acf` de cada biblioteca. Abre por `steam://rungameid/ID`. Capas vêm do CDN da Steam.
- **Epic:** manifestos `.item` em `ProgramData\Epic\EpicGamesLauncher\Data\Manifests`. Abre pelo protocolo `com.epicgames.launcher://`.
- **GOG:** registro do Windows (`GOG.com\Games`). Abre o executável direto, sem precisar do Galaxy.

Capas de Epic e GOG ainda não são baixadas: esses jogos aparecem com o pôster gerado.
Só nos jogos manuais dá para escolher uma imagem.

## Fontes

Oxanium e JetBrains Mono (licença SIL OFL), incluídas em `renderer/fonts/`.

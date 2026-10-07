# BulkSender Ktarze (Extensão Chrome)

Extensão de exemplo que permite importar contatos via planilha Excel/CSV e disparar mensagens personalizadas em massa pelo WhatsApp Web.

## Recursos implementados

- Importação de planilhas `.xlsx`, `.xls` ou `.csv` e detecção automática das colunas disponíveis.
- Inserção de variáveis dinâmicas na mensagem usando o formato `{{NomeDaColuna}}`.
- Pré-visualização da mensagem montada para o primeiro contato.
- Controle do intervalo entre envios.
- Automação do envio diretamente no WhatsApp Web (é necessário estar logado e manter a aba aberta).

## Como baixar os arquivos da extensão

1. Acesse o repositório no GitHub e clique no botão **Code** (verde). 
2. Escolha a opção **Download ZIP** para baixar os arquivos para o seu computador. 
3. Extraia o arquivo `.zip` para uma pasta local (o conteúdo precisa ficar descompactado). 
4. Dentro da pasta extraída, localize o diretório `extension/` — é nele que estão os arquivos da extensão. 

> Caso prefira usar `git`, execute `git clone <URL_DO_REPOSITORIO>` e navegue até a pasta `extension/`.

## Como usar

1. Abra `chrome://extensions` no Google Chrome ou Chromium baseado em Chrome.
2. Ative o **Modo do desenvolvedor** (no canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/` deste repositório.
4. Abra o WhatsApp Web e faça login.
5. Clique no ícone da extensão e:
   - Importe sua planilha com as colunas desejadas.
   - Selecione a coluna que contém os números de telefone (incluindo DDI/DDI sem símbolos).
   - Escreva a mensagem utilizando variáveis, ex.: `Olá {{Nome}}, tudo bem?`.
   - Defina o intervalo entre envios e clique em **Iniciar campanha**.

Durante o envio, mantenha a aba do WhatsApp Web em primeiro plano para evitar bloqueios pelo navegador.

> ⚠️ **Aviso**: utilize esta extensão de acordo com os termos de uso do WhatsApp. O envio massivo de mensagens pode resultar em restrições na sua conta.

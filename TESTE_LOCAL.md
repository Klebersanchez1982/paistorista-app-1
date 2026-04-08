# Teste Local - Paistorista

Este guia descreve as configuracoes necessarias para executar e testar o projeto localmente no Windows.

## 1. Pre-requisitos

- Navegador atualizado (Chrome, Edge ou Firefox).
- Conexao com internet (Firebase e Google Maps sao carregados via CDN).
- Um dos servidores locais abaixo:
  - Python 3 (recomendado)
  - Node.js (alternativa)

## 2. Estrutura esperada

A raiz do projeto deve conter arquivos como:

- `index.html`
- `login.html`
- `app.html`
- `passageiro.html`
- `firebase-config.js`
- `style.css`
- `js/main.js`
- `js/app-config.js`

## 3. Configuracoes importantes

### 3.1 Firebase

O arquivo `firebase-config.js` inicializa Firebase Auth e Firestore.

Para login funcionar no ambiente local, confirme no console do Firebase:

1. `Authentication` > `Settings` > `Authorized domains`
2. Verifique se estes dominios existem:
   - `localhost`
   - `127.0.0.1`

Se nao estiverem autorizados, o login pode falhar com erro de dominio nao autorizado.

### 3.2 Google Maps

O carregamento do mapa depende da chave por host em `js/app-config.js`.

Hosts suportados no projeto:

- `localhost`
- `127.0.0.1`
- `klebersanchez1982.github.io`

Se voce abrir em outro host, o mapa pode nao carregar.

## 4. Como iniciar localmente

Abra um terminal na pasta do projeto:

```powershell
cd "c:\Projetos\paistorista-app-1-main - Copia"
```

### Opcao A (Python)

```powershell
python -m http.server 8000
```

### Opcao B (Node)

```powershell
npx http-server . -p 8000
```

Com o servidor ativo, abra no navegador:

- `http://localhost:8000`
- ou `http://127.0.0.1:8000`

Nao use `file:///...` para testar.

## 5. Checklist de smoke test

1. Abrir `http://localhost:8000`.
2. Confirmar redirecionamento para `login.html` quando nao autenticado.
3. Login com Google como motorista.
4. Em `app.html`:
   - preencher escola, vagas, origem, destino e horario
   - testar "Tracar rota"
   - salvar carona
5. Logout e login como passageiro.
6. Em `passageiro.html`:
   - listar escolas/caronas
   - solicitar carona
7. Confirmar que o rodape de versao `v2.0.0` aparece nas paginas.

## 6. Problemas comuns

### ERRO: `ERR_CONNECTION_REFUSED`

Causa: servidor local nao iniciou.

Solucao:

- iniciar um dos comandos da secao 4
- manter o terminal aberto enquanto testa

### Mapa nao carrega

Causas comuns:

- URL fora de `localhost` ou `127.0.0.1`
- chave de API sem permissoes/restricoes corretas no Google Cloud

Solucao:

- testar em `http://localhost:8000`
- revisar chave e restricoes da API Maps

### Falha no login Google

Causa comum: dominio local nao autorizado no Firebase.

Solucao:

- adicionar `localhost` e `127.0.0.1` em `Authorized domains`

## 7. Comandos uteis

Parar servidor no terminal:

```powershell
Ctrl + C
```

Reiniciar servidor:

```powershell
python -m http.server 8000
```

## 8. Observacao de ambiente

Como o projeto depende de servicos externos (Firebase e Google Maps), testes locais sem internet podem falhar parcial ou totalmente.

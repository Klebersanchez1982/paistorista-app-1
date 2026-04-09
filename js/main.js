// js/main.js

import { getEnvironmentName, getMapsApiKey } from './app-config.js';

// Importações do Firebase
const auth = firebase.auth();
const db = firebase.firestore();
let refreshTimerStarted = false;
let mapsScriptPromise = null;

// Função de logout (comum)
export async function logoutUser() {
  try {
    await auth.signOut();
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    alert('⚠️ Erro ao sair: ' + error.message);
  }
}

// Função comum para mostrar/esconder loading
function showLoading(show) {
  const loading = document.getElementById('loading');
  const main = document.querySelector('main');
  if (loading && main) {
    loading.style.display = show ? 'block' : 'none';
    main.style.display = show ? 'none' : 'block';
  }
}

function waitForGoogleMaps(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      if (window.google && window.google.maps) {
        clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(intervalId);
        reject(new Error('Google Maps não carregou no tempo esperado.'));
      }
    }, 200);
  });
}

function loadGoogleMapsScript(apiKey) {
  if (window.google && window.google.maps) {
    return Promise.resolve();
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps="dynamic"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Falha ao carregar Google Maps.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.setAttribute('data-google-maps', 'dynamic');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Maps.'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

function mostFrequent(values) {
  const counts = new Map();
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  let bestValue = '';
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });

  return bestValue;
}

function fillDatalist(datalist, values) {
  if (!datalist) return;
  datalist.innerHTML = '';

  values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      datalist.appendChild(option);
    });
}

// Tempo limite para resposta (5 minutos em ms)
const REQUEST_TIMEOUT = 5 * 60 * 1000;

// Lógica geral: Espera auth state em todas as páginas protegidas
document.addEventListener('DOMContentLoaded', () => {
  showLoading(true);  // Mostra loading inicialmente
  if (window.M && typeof M.AutoInit === 'function') {
    M.AutoInit();  // Inicializa Materialize
  }

  auth.onAuthStateChanged(async user => {
    try {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      // Usuário logado: Carrega dados específicos da página
      if (window.location.pathname.endsWith('passageiro.html')) {
        await loadPassengerPage(user);
      } else if (window.location.pathname.endsWith('app.html')) {
        await loadDriverPage(user);
      }

      // Atualiza a página periodicamente (evita múltiplos timers)
      if (!refreshTimerStarted) {
        refreshTimerStarted = true;
        setInterval(() => {
          location.reload();
        }, 500000);
      }
    } catch (error) {
      console.error('Erro ao inicializar página:', error);
      alert('⚠️ Erro ao carregar a tela. Recarregue a página.\n\nDetalhe: ' + (error?.message || error));
    } finally {
      showLoading(false);  // Esconde loading mesmo em caso de erro
    }
  });
});

// Função para carregar página de passageiro
async function loadPassengerPage(user) {
  const schoolList = document.getElementById('school-list');
  const schoolSearchInput = document.getElementById('school-search');
  const ridesList = document.getElementById('rides-list');
  const myRequests = document.getElementById('my-requests');
  let availableSchools = [];
  let selectedSchoolName = '';

  function selectSchool(schoolName) {
    selectedSchoolName = schoolName;
    loadRidesForSchool(schoolName);
    renderSchoolList(schoolSearchInput?.value || '');
  }

  function renderSchoolList(filterValue = '') {
    const filter = String(filterValue || '').trim().toLowerCase();

    schoolList.innerHTML = '<li class="collection-header"><h6>Lista de Escolas</h6></li>';

    const filteredSchools = availableSchools.filter((schoolName) =>
      schoolName.toLowerCase().includes(filter)
    );

    if (!filteredSchools.length) {
      const empty = document.createElement('li');
      empty.classList.add('collection-item');
      empty.textContent = 'Nenhuma escola encontrada para este filtro.';
      schoolList.appendChild(empty);
      return;
    }

    filteredSchools.forEach(schoolName => {
      const li = document.createElement('li');
      li.classList.add('collection-item');
      if (selectedSchoolName === schoolName) {
        li.classList.add('school-selected');
      }
      li.innerHTML = `
        <button type="button" class="school-select-btn" data-school-name="${schoolName.replace(/"/g, '&quot;')}">
          <span>${schoolName}</span>
          <span class="secondary-content"><i class="material-icons" aria-hidden="true">school</i></span>
        </button>
      `;
      li.querySelector('.school-select-btn')?.addEventListener('click', () => selectSchool(schoolName));
      schoolList.appendChild(li);
    });
  }

  // Listener em tempo real para caronas, para extrair escolas únicas
  db.collection('caronas').onSnapshot(snapshot => {
    const schools = new Set(); // Usar Set para nomes únicos de escolas
    snapshot.forEach(doc => {
      const ride = doc.data();
      const vagasDisponiveis = Number(ride.vagas ?? ride.vagasDisponiveis ?? 0);
      if (ride.escola && vagasDisponiveis > 0 && ride.status !== 'inativa') {
        schools.add(ride.escola); // Adiciona nome da escola se houver vagas
      }
    });

    availableSchools = Array.from(schools).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    renderSchoolList(schoolSearchInput?.value || '');
  });

  schoolSearchInput?.addEventListener('input', () => {
    renderSchoolList(schoolSearchInput.value);
  });

  schoolSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;

    const filter = String(schoolSearchInput.value || '').trim().toLowerCase();
    const firstMatch = availableSchools.find((schoolName) =>
      schoolName.toLowerCase().includes(filter)
    );

    if (firstMatch) {
      event.preventDefault();
      selectSchool(firstMatch);
    }
  });

  let unsubscribeRides; // Para cancelar listener anterior de caronas

  // Função para carregar e escutar caronas de uma escola específica em tempo real (por nome da escola)
  function loadRidesForSchool(schoolName) {
    if (unsubscribeRides) unsubscribeRides(); // Cancela listener anterior

    ridesList.innerHTML = '<li class="collection-header"><h6>Caronas para esta escola</h6></li>'; // Limpa lista

    unsubscribeRides = db.collection('caronas')
      .where('escola', '==', schoolName)
      .where('vagas', '>', 0)
      .onSnapshot(snapshot => {
        // Limpa itens existentes (exceto header)
        while (ridesList.children.length > 1) {
          ridesList.removeChild(ridesList.lastChild);
        }

        if (snapshot.empty) {
          const empty = document.createElement('li');
          empty.classList.add('collection-item');
          empty.textContent = 'Nao ha caronas disponiveis para esta escola no momento.';
          ridesList.appendChild(empty);
          return;
        }

        snapshot.forEach(doc => {
          const ride = doc.data();
          const li = document.createElement('li');
          li.classList.add('collection-item');
          li.innerHTML = `
            <div>Motorista: ${ride.motorista} | Vagas: ${ride.vagas} | Horário: ${ride.horario || 'Não especificado'}
              <a href="#!" class="secondary-content" onclick="requestRide('${doc.id}')"><i class="material-icons">add_circle</i></a>
            </div>
          `;
          ridesList.appendChild(li);
        });
      });
  }

  // Função para solicitar carona
  window.requestRide = async function(rideId) {
    try {
      const rideDoc = await db.collection('caronas').doc(rideId).get();
      if (!rideDoc.exists) throw "Carona não existe";
      const rideData = rideDoc.data();

      if (rideData.vagas <= 0) throw "Sem vagas disponíveis";

      // Adiciona solicitação
      await db.collection('solicitacoes').add({
        passageiroId: user.uid,
        passageiroNome: user.displayName,
        rideId,
        motoristaId: rideData.uid,
        motoristaNome: rideData.motorista,
        horario: rideData.horario,
        status: 'pendente',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert('✅ Solicitação enviada! Aguarde a resposta do motorista.');

      // Inicia timer para cancelamento automático (lógica no lado do servidor seria melhor, mas simulando aqui)
      setTimeout(async () => {
        const reqSnap = await db.collection('solicitacoes').where('rideId', '==', rideId).where('passageiroId', '==', user.uid).get();
        if (!reqSnap.empty) {
          const reqDoc = reqSnap.docs[0];
          if (reqDoc.data().status === 'pendente') {
            await reqDoc.ref.update({ status: 'cancelada' });
            alert('⚠️ Solicitação cancelada por falta de resposta.');
          }
        }
      }, REQUEST_TIMEOUT);
    } catch (error) {
      alert('⚠️ Erro ao solicitar: ' + error.message || error);
    }
  };

  // Listener em tempo real para minhas solicitações
  db.collection('solicitacoes')
    .where('passageiroId', '==', user.uid)
    .onSnapshot(snapshot => {
      myRequests.innerHTML = '<li class="collection-header"><h6>Solicitações realizadas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const req = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Carona ID: ${req.rideId} | Motorista: ${req.motoristaNome || 'N/A'} | Status: ${req.status}`;
        if (req.status === 'aceita') {
          li.innerHTML += ` | Horário: ${req.horario || 'N/A'}`;
        }
        myRequests.appendChild(li);
      });
    });
}

// Função para carregar página de motorista
async function loadDriverPage(user) {
  let map, directionsService, directionsRenderer, geocoder, currentMarker, destinationMarker;
  const schoolProfiles = new Map();

  const schoolInput = document.getElementById('school');
  const destinationInput = document.getElementById('destination');
  const originInput = document.getElementById('origin');
  const timeInput = document.getElementById('time');
  const schoolInfo = document.getElementById('school-info');
  const schoolDatalist = document.getElementById('school-suggestions');
  const destinationDatalist = document.getElementById('destination-suggestions');

  const env = getEnvironmentName();
  const mapsApiKey = getMapsApiKey();

  if (!mapsApiKey) {
    throw new Error(`Google Maps sem chave configurada para o host ${window.location.hostname} (ambiente: ${env}).`);
  }

  await loadGoogleMapsScript(mapsApiKey);

  await waitForGoogleMaps();

  const mapElement = document.getElementById('map');
  if (!mapElement) {
    throw new Error('Elemento do mapa não encontrado.');
  }

  map = new google.maps.Map(mapElement, {
    zoom: 12,
    center: { lat: -23.5505, lng: -46.6333 } // Centro padrão (São Paulo)
  });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
  geocoder = new google.maps.Geocoder(); // Inicializa o Geocoder

  function setSchoolInfo(message) {
    if (!schoolInfo) return;
    schoolInfo.textContent = message;
  }

  function findSchoolProfile(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return schoolProfiles.get(key) || null;
  }

  function updateSchoolSuggestions() {
    const schools = [];
    const destinations = [];

    schoolProfiles.forEach((profile) => {
      if (profile?.name) schools.push(profile.name);
      if (profile?.topDestination) destinations.push(profile.topDestination);
    });

    fillDatalist(schoolDatalist, schools);
    fillDatalist(destinationDatalist, destinations);
  }

  db.collection('caronas')
    .where('status', '==', 'ativa')
    .onSnapshot((snapshot) => {
      schoolProfiles.clear();

      snapshot.forEach((doc) => {
        const ride = doc.data();
        const schoolName = String(ride.escola || '').trim();
        if (!schoolName) return;

        const key = schoolName.toLowerCase();
        const profile = schoolProfiles.get(key) || {
          name: schoolName,
          destinations: [],
          horarios: [],
          total: 0
        };

        profile.total += 1;
        if (ride.destino) profile.destinations.push(ride.destino);
        if (ride.horario) profile.horarios.push(ride.horario);
        schoolProfiles.set(key, profile);
      });

      schoolProfiles.forEach((profile, key) => {
        schoolProfiles.set(key, {
          ...profile,
          topDestination: mostFrequent(profile.destinations),
          topHorario: mostFrequent(profile.horarios)
        });
      });

      updateSchoolSuggestions();
    });

  if (schoolInput) {
    schoolInput.addEventListener('input', () => {
      const schoolName = schoolInput.value;
      const profile = findSchoolProfile(schoolName);

      if (!profile) {
        setSchoolInfo('Digite o nome da escola para receber sugestoes automaticas. Voce tambem pode clicar no mapa para definir o destino.');
        return;
      }

      if (destinationInput && !destinationInput.value && profile.topDestination) {
        destinationInput.value = profile.topDestination;
      }

      if (timeInput && !timeInput.value && profile.topHorario) {
        timeInput.value = profile.topHorario;
      }

      M.updateTextFields();

      const hintParts = [`Base encontrada para ${profile.name}`];
      if (profile.topDestination) hintParts.push(`destino sugerido: ${profile.topDestination}`);
      if (profile.topHorario) hintParts.push(`horario sugerido: ${profile.topHorario}`);
      setSchoolInfo(hintParts.join(' | '));
    });
  }

  if (google.maps.places && schoolInput) {
    const schoolAutocomplete = new google.maps.places.Autocomplete(schoolInput, {
      fields: ['name', 'formatted_address', 'geometry', 'types']
    });

    schoolAutocomplete.addListener('place_changed', () => {
      const place = schoolAutocomplete.getPlace();
      if (!place) return;

      const isSchool = Array.isArray(place.types) && place.types.includes('school');
      if (place.name) schoolInput.value = place.name;

      if (destinationInput && !destinationInput.value && place.formatted_address) {
        destinationInput.value = place.formatted_address;
      }

      if (place.geometry?.location) {
        map.setCenter(place.geometry.location);
        map.setZoom(15);
      }

      M.updateTextFields();
      setSchoolInfo(isSchool
        ? `Escola encontrada no mapa: ${place.name || 'nome nao informado'}.`
        : 'Local selecionado. Confira se corresponde a escola desejada.');
    });
  }

  if (google.maps.places && destinationInput) {
    const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
      fields: ['formatted_address', 'geometry']
    });

    destinationAutocomplete.addListener('place_changed', () => {
      const place = destinationAutocomplete.getPlace();
      if (!place?.geometry?.location) return;

      map.setCenter(place.geometry.location);
      map.setZoom(15);

      if (destinationMarker) {
        destinationMarker.setMap(null);
      }

      destinationMarker = new google.maps.Marker({
        position: place.geometry.location,
        map,
        title: 'Destino selecionado'
      });
    });
  }

  map.addListener('click', (event) => {
    const clickedLatLng = event.latLng;

    geocoder.geocode({ location: clickedLatLng }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        setSchoolInfo('Nao foi possivel converter o ponto clicado em endereco. Tente novamente.');
        return;
      }

      if (destinationInput) {
        destinationInput.value = results[0].formatted_address;
        M.updateTextFields();
      }

      if (destinationMarker) {
        destinationMarker.setMap(null);
      }

      destinationMarker = new google.maps.Marker({
        position: clickedLatLng,
        map,
        title: 'Destino selecionado no mapa'
      });

      setSchoolInfo('Destino definido pelo mapa. Endereco preenchido automaticamente.');
    });
  });

  // Botão para usar localização atual como origem
  document.getElementById('btn-location')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        const latlng = new google.maps.LatLng(latitude, longitude);

        // Usa reverse geocoding para obter o endereço
        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === 'OK') {
            if (results[0]) {
              if (originInput) {
                originInput.value = results[0].formatted_address;
              }
              M.updateTextFields(); // Atualiza label do Materialize

              // Atualiza o mapa: centraliza e adiciona marcador
              map.setCenter(latlng);
              map.setZoom(15); // Aumenta o zoom para focar na localização

              // Remove marcador anterior se existir
              if (currentMarker) {
                currentMarker.setMap(null);
              }

              // Adiciona novo marcador
              currentMarker = new google.maps.Marker({
                position: latlng,
                map: map,
                title: 'Localização Atual'
              });
            } else {
              alert('⚠️ Nenhum resultado encontrado.');
            }
          } else {
            alert('⚠️ Erro no geocoding: ' + status);
          }
        });
      }, error => {
        alert('⚠️ Erro ao obter localização: ' + error.message);
      });
    } else {
      alert('⚠️ Geolocalização não suportada.');
    }
  });

  // Botão para traçar rota
  document.getElementById('btn-route')?.addEventListener('click', () => {
    const origin = originInput?.value;
    const destination = destinationInput?.value;
    if (!origin || !destination) {
      alert('⚠️ Preencha origem e destino.');
      return;
    }

    directionsService.route({
      origin,
      destination,
      travelMode: 'DRIVING'
    }, (response, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(response);
      } else {
        alert('⚠️ Erro ao traçar rota: ' + status);
      }
    });
  });

  // Botão para salvar carona
  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const school = schoolInput?.value;
    const seats = parseInt(document.getElementById('seats').value);
    const origin = originInput?.value;
    const destination = destinationInput?.value;
    const time = timeInput?.value;

    if (!school || !seats || !origin || !destination || !time) {
      alert('⚠️ Preencha todos os campos.');
      return;
    }

    try {
      await db.collection('caronas').add({
        escola: school,
        motorista: user.displayName,
        uid: user.uid,
        vagas: seats,
        vagasDisponiveis: seats,
        origem: origin,
        destino: destination,
        horario: time,
        dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'ativa',
        solicitacoes: []
      });
      alert('✅ Carona salva com sucesso!');
      // Limpa formulário
      document.getElementById('school').value = '';
      document.getElementById('seats').value = '';
      document.getElementById('origin').value = '';
      document.getElementById('destination').value = '';
      document.getElementById('time').value = '';
      M.updateTextFields();
    } catch (error) {
      alert('⚠️ Erro ao salvar: ' + error.message);
    }
  });

  // Carregar minhas caronas
  const myRides = document.getElementById('my-rides');
  db.collection('caronas')
    .where('uid', '==', user.uid)
    .onSnapshot(snapshot => {
      myRides.innerHTML = '<li class="collection-header"><h6>Suas caronas cadastradas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const ride = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Escola: ${ride.escola} | Vagas: ${ride.vagas} | Horário: ${ride.horario}`;
        myRides.appendChild(li);
      });
    });

  // Carregar solicitações pendentes
  const pendingRequests = document.getElementById('pending-requests');
  db.collection('solicitacoes')
    .where('motoristaId', '==', user.uid)
    .where('status', '==', 'pendente')
    .onSnapshot(snapshot => {
      pendingRequests.innerHTML = '<li class="collection-header"><h6>Solicitações para suas caronas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const req = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Passageiro: ${req.passageiroNome} | Carona ID: ${req.rideId}
          <a href="#!" class="secondary-content" onclick="acceptRequest('${doc.id}', '${req.rideId}')"><i class="material-icons green-text">check</i></a>
          <a href="#!" class="secondary-content" onclick="rejectRequest('${doc.id}')"><i class="material-icons red-text">close</i></a>
        `;
        pendingRequests.appendChild(li);

        // Verifica timeout
        const timestamp = req.timestamp.toMillis();
        const elapsed = Date.now() - timestamp;
        if (elapsed > REQUEST_TIMEOUT) {
          doc.ref.update({ status: 'cancelada' });
        }
      });
    });
}

// Funções para aceitar/recusar solicitação
window.acceptRequest = async function(reqId, rideId) {
  try {
    const reqRef = db.collection('solicitacoes').doc(reqId);
    const rideRef = db.collection('caronas').doc(rideId);

    await db.runTransaction(async (transaction) => {
      const rideDoc = await transaction.get(rideRef);
      if (!rideDoc.exists) throw "Carona não existe";
      const newVagas = rideDoc.data().vagas - 1;
      if (newVagas < 0) throw "Sem vagas disponíveis";

      transaction.update(rideRef, { vagas: newVagas });
      transaction.update(reqRef, { status: 'aceita' });
    });

    alert('✅ Solicitação aceita!');
  } catch (error) {
    alert('⚠️ Erro ao aceitar: ' + error.message || error);
  }
};

window.rejectRequest = async function(reqId) {
  try {
    await db.collection('solicitacoes').doc(reqId).update({ status: 'recusada' });
    alert('✅ Solicitação recusada.');
  } catch (error) {
    alert('⚠️ Erro ao recusar: ' + error.message);
  }
};

// Listener de logout
document.getElementById('btn-logout')?.addEventListener('click', logoutUser);



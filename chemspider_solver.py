import re
import requests
from bs4 import BeautifulSoup

"""
NÃO FUNCIONANDO !!!
VER COMO CONSERTAR
"""

def pegar_inchkey(link: str) -> str:
   
   # identifica se link é do ChemSpider ou do LipidMaps
    match_chemspider = re.search(r'param=(\d+)', link)
    match_lipidmaps = re.search(r'LMID=([A-Za-z0-9]+)', link)

    if match_chemspider and 'chemspider' in link:
        # pega o id do elemento do ChemSpider
        id_elemento = match_chemspider.group(1)
        # requisição do html da página
        url_real = f"http://www.chemspider.com/Chemical-Structure.{id_elemento}.html"
        resposta = requests.get(url_real)
        
        if resposta.status_code == 200:
            soup = BeautifulSoup(resposta.text, 'html.parser')

            inchkey_part_01 = soup.find('a', id='content-link-1-std.-inchikey')
            inchkey_part_01 = inchkey_part_01.text if inchkey_part_01 else ''

            inchkey_part_02 = soup.find('a', id='content-link-2-std.-inchikey')
            inchkey_part_02 = inchkey_part_02.text if inchkey_part_02 else ''

            if not inchkey_part_01 or not inchkey_part_02:
                return "InChIKey não encontrado no ChemSpider"
            
            return inchkey_part_01 + inchkey_part_02
        else:
            return f"Erro ao acessar ChemSpider: {resposta.status_code}"
    
    elif match_lipidmaps and 'lipidmaps' in link:
        html = requests.get(link)

        if html.status_code != 200:
            return f"Erro ao acessar LipidMaps: {html.status_code}"
        soup = BeautifulSoup(html.text, 'html.parser')

        inchkey = soup.find('div', class_='p-2 border border-gray-400 rounded click:highlight')
        inchkey = inchkey.text if inchkey else ''

        if not inchkey:
            return "InChIKey não encontrado no LipidMaps"

        return inchkey
    else:
        return "Link não suportado (links suportados: ChemSpider e LipidMaps)"

print("--- TESTE 1: ChemSpider ---")
print(pegar_inchkey('http://nonlinear.com/redirect/outbound?p=chemspider&param=16671964'))

print("\n--- TESTE 2: LipidMaps ---")
print(pegar_inchkey('http://www.lipidmaps.org/data/LMSDRecord.php?LMID=LMPK12050117'))
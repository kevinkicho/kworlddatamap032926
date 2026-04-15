import pandas as pd
import json

# Read the data
df = pd.read_excel('public/inform_risk_2024.xlsx', sheet_name='INFORM Risk 2024 (a-z)', header=1)
df = df.iloc[1:].reset_index(drop=True)

# ISO3 to ISO2 mapping
ISO3_TO_ISO2 = {'AFG':'AF','ALB':'AL','DZA':'DZ','ASM':'AS','AND':'AD','AGO':'AO','AIA':'AI','ATA':'AQ','ATG':'AG','ARG':'AR','ARM':'AM','ABW':'AW','AUS':'AU','AUT':'AT','AZE':'AZ','BHS':'BS','BHR':'BH','BGD':'BD','BRB':'BB','BLR':'BY','BEL':'BE','BLZ':'BZ','BEN':'BJ','BMU':'BM','BTN':'BT','BOL':'BO','BES':'BQ','BIH':'BA','BWA':'BW','BVT':'BV','BRA':'BR','IOT':'IO','BRN':'BN','BGR':'BG','BFA':'BF','BDI':'BI','KHM':'KH','CMR':'CM','CAN':'CA','CPV':'CV','CYM':'KY','CAF':'CF','TCD':'TD','CHL':'CL','CHN':'CN','CXR':'CX','CCK':'CC','COL':'CO','COM':'KM','COG':'CG','COD':'CD','COK':'CK','CRI':'CR','HRV':'HR','CUB':'CU','CUW':'CW','CYP':'CY','CZE':'CZ','CIV':'CI','DNK':'DK','DJI':'DJ','DMA':'DM','DOM':'DO','ECU':'EC','EGY':'EG','SLV':'SV','GNQ':'GQ','ERI':'ER','EST':'EE','SWZ':'SZ','ETH':'ET','FLK':'FK','FRO':'FO','FJI':'FJ','FIN':'FI','FRA':'FR','GUF':'GF','PYF':'PF','ATF':'TF','GAB':'GA','GMB':'GM','GEO':'GE','DEU':'DE','GHA':'GH','GIB':'GI','GRC':'GR','GRL':'GL','GRD':'GD','GLP':'GP','GUM':'GU','GTM':'GT','GGY':'GG','GIN':'GN','GNB':'GW','GUY':'GY','HTI':'HT','HMD':'HM','VAT':'VA','HND':'HN','HKG':'HK','HUN':'HU','ISL':'IS','IND':'IN','IDN':'ID','IRN':'IR','IRQ':'IQ','IRL':'IE','IMN':'IM','ISR':'IL','ITA':'IT','JAM':'JM','JPN':'JP','JEY':'JE','JOR':'JO','KAZ':'KZ','KEN':'KE','KIR':'KI','PRK':'KP','KOR':'KR','KWT':'KW','KGZ':'KG','LAO':'LA','LVA':'LV','LBN':'LB','LSO':'LS','LBR':'LR','LBY':'LY','LIE':'LI','LTU':'LT','LUX':'LU','MAC':'MO','MDG':'MG','MWI':'MW','MYS':'MY','MDV':'MV','MLI':'ML','MLT':'MT','MHL':'MH','MTQ':'MQ','MRT':'MR','MUS':'MU','MYT':'YT','MEX':'MX','FSM':'FM','MDA':'MD','MCO':'MC','MNG':'MN','MNE':'ME','MSR':'MS','MAR':'MA','MOZ':'MZ','MMR':'MM','NAM':'NA','NRU':'NR','NPL':'NP','NLD':'NL','NCL':'NC','NZL':'NZ','NIC':'NI','NER':'NE','NGA':'NG','NIU':'NU','NFK':'NF','MKD':'MK','MNP':'MP','NOR':'NO','OMN':'OM','PAK':'PK','PLW':'PW','PSE':'PS','PAN':'PA','PNG':'PG','PRY':'PY','PER':'PE','PHL':'PH','PCN':'PN','POL':'PL','PRT':'PT','PRI':'PR','QAT':'QA','REU':'RE','ROU':'RO','RUS':'RU','RWA':'RW','BLM':'BL','SHN':'SH','KNA':'KN','LCA':'LC','MAF':'MF','SPM':'PM','VCT':'VC','WSM':'WS','SMR':'SM','STP':'ST','SAU':'SA','SEN':'SN','SRB':'RS','SYC':'SC','SLE':'SL','SGP':'SG','SXM':'SX','SVK':'SK','SVN':'SI','SLB':'SB','SOM':'SO','ZAF':'ZA','SGS':'GS','SSD':'SS','ESP':'ES','LKA':'LK','SDN':'SD','SUR':'SR','SJM':'SJ','SWE':'SE','CHE':'CH','SYR':'SY','TWN':'TW','TJK':'TJ','TZA':'TZ','THA':'TH','TLS':'TL','TGO':'TG','TKL':'TK','TON':'TO','TTO':'TT','TUN':'TN','TUR':'TR','TKM':'TM','TCA':'TC','TUV':'TV','UGA':'UG','UKR':'UA','ARE':'AE','GBR':'GB','USA':'US','UMI':'UM','URY':'UY','UZB':'UZ','VUT':'VU','VEN':'VE','VNM':'VN','VGB':'VG','VIR':'VI','WLF':'WF','ESH':'EH','YEM':'YE','ZMB':'ZM','ZWE':'ZW'}

risk_data = {}
for _, row in df.iterrows():
    iso3 = row['ISO3']
    if pd.isna(iso3):
        continue
    iso2 = ISO3_TO_ISO2.get(iso3)
    if not iso2:
        continue
    def get_float(val):
        try:
            return float(val) if pd.notna(val) else None
        except:
            return None
    risk_data[iso2] = {
        'name': row['COUNTRY'],
        'risk_score': get_float(row['INFORM RISK']),
        'risk_class': row['RISK CLASS'] if pd.notna(row['RISK CLASS']) else None,
        'rank': int(row['Rank']) if pd.notna(row['Rank']) else None,
        'hazard_exposure': get_float(row['HAZARD & EXPOSURE']),
        'vulnerability': get_float(row['VULNERABILITY']),
        'coping_capacity': get_float(row['LACK OF COPING CAPACITY']),
        'earthquake': get_float(row['Earthquake']),
        'flood': get_float(row['River Flood']),
        'cyclone': get_float(row['Tropical Cyclone']),
        'drought': get_float(row['Drought']),
        'epidemic': get_float(row['Epidemic']),
        'conflict': get_float(row['Projected Conflict Risk']),
    }

with open('public/inform_risk.json', 'w') as f:
    json.dump(risk_data, f, indent=2)

print(f'Processed {len(risk_data)} countries')
print('Sample US:', json.dumps(risk_data.get('US', {}), indent=2))
print('Sample AF:', json.dumps(risk_data.get('AF', {}), indent=2))
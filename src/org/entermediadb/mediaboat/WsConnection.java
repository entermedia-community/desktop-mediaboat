package org.entermediadb.mediaboat;

import java.io.StringReader;
import java.net.URI;
import java.util.Collection;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft;
import org.java_websocket.handshake.ServerHandshake;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;


public class WsConnection extends WebSocketClient
{
    protected ThreadLocal perThreadCache = new ThreadLocal();

    AppController	 fieldController;
    protected boolean disconnected = false;
	public AppController getAppController()
	{
		return fieldController;
	}

	public void setAppController(AppController inModel)
	{
		fieldController = inModel;
	}
	
	public WsConnection(URI inServerUri,Draft inDraft)
	{
		super(inServerUri,inDraft);
		// TODO Auto-generated constructor stub
	}

	@Override
	public void onOpen(ServerHandshake inHandshakedata)
	{
		// TODO Auto-generated method stub
		
	}
	public JSONParser getJSONParser()
	{
		JSONParser jSONParser = (JSONParser)perThreadCache.get();
		if (jSONParser == null) 
		{
			jSONParser = new JSONParser();
			perThreadCache.set(jSONParser);
		}
		return jSONParser;
	}

	public void send(Message inMes)
	{
		JSONObject object = new JSONObject(inMes);
		String text = object.toJSONString();
		send(text);
	}


	@Override
	public void onClose(int inCode, String inReason, boolean inRemote)
	{
		//Show the UI
		getAppController().reconnect();
	}

	@Override
	public void onError(Exception inEx)
	{
		//Show the UI Dialog
	}
	@Override
	public void onMessage(String inMessage)
	{
		try
		{
			if( disconnected )
			{
				getAppController().info("disconnected");
				return;
			}
			JSONObject map = (JSONObject)getJSONParser().parse(new StringReader(inMessage));
			String command = (String)map.get("command");
			getAppController().info(command);
			if( "authenticated".equals( command))
			{
				String value = (String)map.get("entermedia.key");
				getAppController().loginComplete(value);
				//getAppController().getConfig().put("entermedia.key", value);
			}
			else if( "downloadto".equals( command))
			{
				getAppController().download(map);
			}
			
			else if( "checkincollection".equals( command))
			{

				getAppController().checkinFiles(map);
				
			}
			
			
		} catch (Throwable ex)
		{
	 		//throw new RuntimeException(ex);
			getAppController().reportError("Message problem", ex);
		}
	}

	public void disconnect()
	{
		// TODO Auto-generated method stub
		disconnected = true;		
	}

}

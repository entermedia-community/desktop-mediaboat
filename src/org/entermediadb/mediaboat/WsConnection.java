package org.entermediadb.mediaboat;

import java.io.StringReader;
import java.net.URI;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.simple.JSONObject;
import org.json.simple.parser.*;


public class WsConnection extends WebSocketClient
{
    protected ThreadLocal perThreadCache = new ThreadLocal();

    AppController fieldAppController;

	public AppController getAppController()
	{
		return fieldAppController;
	}

	public void setAppController(AppController inAppController)
	{
		fieldAppController = inAppController;
	}

	public WsConnection(URI inServerUri)
	{
		super(inServerUri);
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
			JSONObject map = (JSONObject)getJSONParser().parse(new StringReader(inMessage));
			String command = (String)map.get("command");
			if( "downloadto".equals( command))
			{
				getAppController().download(map);
			}
		} catch (Exception ex)
		{
			throw new RuntimeException(ex);
		}
	}

}
